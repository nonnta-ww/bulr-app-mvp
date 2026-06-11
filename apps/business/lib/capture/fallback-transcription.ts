/**
 * フォールバック転写（Requirement 2.6）
 *
 * リアルタイム転写が不健全なセッションを検出し、ボット録音からバッチ転写を行って
 * origin='post_batch' の transcript_segment を挿入し、ターン化する。
 *
 * ## 不健全検出ルール（documented heuristic）
 * 次のいずれかが真かつ録音ソースが存在する場合、フォールバックを実施する:
 *   (a) capture_status === 'failed': 明示的なキャプチャ失敗を記録している
 *   (b) リアルタイムセグメント（post_batch 以外）が 0 件: 完全欠落
 *   (c) 連続セグメント間のギャップが UNHEALTHY_GAP_THRESHOLD_MS (60,000ms) を超える区間あり
 *
 * ## バッチ転写スコープ（MVP documented approximation）
 * リアルタイムセグメントが NEAR_ZERO_REALTIME_SEGMENT_THRESHOLD (= 0) 以下の場合のみ
 * 録音全体をチャンク分割して転写する（full recording fallback）。
 * 既存のリアルタイムセグメントがある場合（gap-only ケース）は、既存コンテンツとの
 * 重複ターン生成を防ぐため MVP では転写をスキップし、ログに記録する。
 * 将来の gap-filling 拡張に委ねる（gap 境界 = バイト境界の対応が非自明なため）。
 *
 * ## チャンク分割（design.md Performance: ③ バッチ転写は 60 分音声で関数上限に迫る）
 * 総バイト数 > CHUNK_SIZE_BYTES (10MB) の場合、ArrayBuffer をバイト境界で分割する。
 * OpenAI Whisper API の 25MB 上限以下に収め、60 分音声（≈30-50MB webm）を複数回で処理する。
 * 音声フォーマット（webm コンテナ）をバイト境界で分割すると再生不能なチャンクが生じる
 * 可能性があるが、Whisper は不完全なチャンクでもある程度認識できる（MVP 上の accepted limitation）。
 * 正確な時間境界分割は将来の改善として位置付ける。
 *
 * ## 冪等性（Requirement 5.5 継承）
 * source_id = `post_batch:${sessionId}:${chunkIdx}` の (session_id, source_id) 一意制約 +
 * onConflictDoNothing により、再実行で重複セグメントを生成しない。
 * interview_turn の turn_fingerprint 一意制約も最終防衛線として維持する。
 *
 * Requirements: 2.6, 5.5
 * Design: FinalizeExtension（処理順 step ③）/ System Flows（面接終了とフォールバック）
 *         / Error Handling（転写の復旧不能 2.6）/ Performance（③ バッチ転写のチャンク分割）
 */

import 'server-only';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { transcribeAudio } from '@bulr/ai';
import { createRecallClient } from './recall-client';
import {
  DEFAULT_SEGMENTER_CONFIG,
  evaluate,
  runWithSessionLock,
  type SegmentInput,
} from './segmenter';
import { createWriteBackConsumer } from './turn-pipeline';

// ---------------------------------------------------------------------------
// 定数（設計判断のドキュメント）
// ---------------------------------------------------------------------------

/**
 * 連続セグメント間のギャップ閾値（ms）。
 * この値を超えるギャップが存在する場合、リアルタイム転写が不健全と判定する。
 * 1 分（60 秒）を閾値とする根拠: Deepgram などのストリーミング STT が
 * 接続を維持したまま 1 分超の無音を持続することは稀であるため、
 * 1 分超のギャップはプロバイダ切断やボット障害の可能性が高い。
 */
export const UNHEALTHY_GAP_THRESHOLD_MS = 60_000;

/**
 * "ゼロ/少量" セグメント数の上限値。
 * この値以下のリアルタイムセグメント数の場合、録音全体をフォールバック転写する。
 * MVP では 0 のみ（リアルタイムセグメントが 1 件以上あれば healthy とみなす）。
 * 将来 gap-filling を実装する場合にこの値を調整する。
 */
export const NEAR_ZERO_REALTIME_SEGMENT_THRESHOLD = 0;

/**
 * 1 チャンクあたりの最大バイトサイズ（バイト）。
 * OpenAI Whisper API は 25MB 制限があるため 10MB に設定する。
 * 60 分音声（≈30-50MB webm）は 3-5 チャンクに分割される想定。
 */
export const CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// ---------------------------------------------------------------------------
// 不健全判定（純粋関数）
// ---------------------------------------------------------------------------

/**
 * セッションのリアルタイム転写が不健全かどうかを判定する（純粋関数）。
 *
 * 不健全判定ルール（OR 条件）:
 *  (a) capture_status === 'failed': 明示的なキャプチャ失敗
 *  (b) realtimeSegments.length === 0: リアルタイムセグメントが完全に欠落
 *  (c) 連続セグメント間に UNHEALTHY_GAP_THRESHOLD_MS を超えるギャップが存在
 *
 * @param session セッション行（capture_status フィールドのみ使用）
 * @param realtimeSegments post_batch を除くセグメントのタイムライン
 * @returns 不健全な場合 true
 */
export function isTranscriptionUnhealthy(
  session: Pick<typeof schema.interviewSession.$inferSelect, 'capture_status'>,
  realtimeSegments: ReadonlyArray<{ started_at_ms: number; ended_at_ms: number }>,
): boolean {
  // (a) 明示的な failed 状態
  if (session.capture_status === 'failed') return true;

  // (b) リアルタイムセグメントがゼロ
  if (realtimeSegments.length === 0) return true;

  // (c) 連続セグメント間のギャップ検出（started_at_ms 昇順でソートして比較）
  const sorted = [...realtimeSegments].sort((a, b) => a.started_at_ms - b.started_at_ms);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]!.started_at_ms - sorted[i - 1]!.ended_at_ms;
    if (gap > UNHEALTHY_GAP_THRESHOLD_MS) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// チャンク分割ユーティリティ（エクスポート: テスト容易性のため）
// ---------------------------------------------------------------------------

/**
 * ArrayBuffer を chunkSize バイトごとに分割する。
 *
 * バイト境界で単純分割する（音声コンテナ境界非考慮）。
 * Whisper は不完全な webm チャンクでもある程度認識できるため MVP では許容する。
 * 空の ArrayBuffer には空配列を返す。
 *
 * @param buffer 分割元のバッファ
 * @param chunkSize 1 チャンクの最大バイト数
 * @returns チャンクの配列
 */
export function splitIntoChunks(buffer: ArrayBuffer, chunkSize: number): ArrayBuffer[] {
  if (buffer.byteLength === 0) return [];
  const chunks: ArrayBuffer[] = [];
  let offset = 0;
  while (offset < buffer.byteLength) {
    chunks.push(buffer.slice(offset, Math.min(offset + chunkSize, buffer.byteLength)));
    offset += chunkSize;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// フォールバック転写本体
// ---------------------------------------------------------------------------

/**
 * フォールバック転写を実行する。
 *
 * 呼び出し前提条件:
 *  - isTranscriptionUnhealthy が true を返した
 *  - session.capture_provider === 'recall' かつ session.bot_id が非 null
 *
 * 処理フロー:
 *  1. 録音取得（保存済み audio_key 優先 → getRecordingDownloadUrl + fetch）
 *  2. チャンク分割 → 各チャンクを transcribeAudio（ロック外）
 *  3. advisory lock 内で:
 *     a. post_batch セグメント insert（onConflictDoNothing で冪等）
 *     b. 未消費セグメントをフラッシュ（evaluate + writeBack でターン化）
 *
 * @param input セッション ID とセッション行、リアルタイムセグメント件数
 * @returns 挿入したセグメント件数（best-effort; 失敗時は 0）
 */
export async function runFallbackTranscription(input: {
  sessionId: string;
  session: typeof schema.interviewSession.$inferSelect;
  realtimeSegmentCount: number;
}): Promise<number> {
  const { sessionId, session, realtimeSegmentCount } = input;

  // MVP スコープ判断: ゼロセグメントの場合のみ全量転写
  // リアルタイムセグメントが存在する場合（gap-only ケース）は重複ターン生成のリスクがあるため
  // MVP では転写をスキップする（design.md Performance ③ の注記、documented limitation）
  if (realtimeSegmentCount > NEAR_ZERO_REALTIME_SEGMENT_THRESHOLD) {
    console.info(
      `[fallback-transcription] gap-only case: skipping full-recording fallback in MVP ` +
        `(realtimeSegmentCount=${realtimeSegmentCount}): sessionId=${sessionId}`,
    );
    return 0;
  }

  // ステップ 1: 録音取得
  // 優先順位: 保存済み audio_key（冪等再実行 step ④ 後のケース）→ Recall API
  let audioBuffer: ArrayBuffer | null = null;

  // 1a. 保存済み audio_key から取得（step ④ 実行後の再実行ケース）
  try {
    const existingRecording = await db.query.captureRecording.findFirst({
      where: and(
        eq(schema.captureRecording.session_id, sessionId),
        eq(schema.captureRecording.kind, 'bot_full'),
      ),
    });
    if (existingRecording?.audio_key) {
      const resp = await fetch(existingRecording.audio_key);
      if (resp.ok) {
        audioBuffer = await resp.arrayBuffer();
        console.info(
          `[fallback-transcription] using stored audio_key: sessionId=${sessionId}`,
        );
      }
    }
  } catch (e) {
    console.warn(
      `[fallback-transcription] stored audio_key fetch failed (trying Recall): sessionId=${sessionId}`,
      e,
    );
  }

  // 1b. Recall API からダウンロード（初回実行 / audio_key 未設定のケース）
  if (!audioBuffer && session.bot_id) {
    try {
      const recall = createRecallClient();
      const urlResult = await recall.getRecordingDownloadUrl(session.bot_id);
      if (urlResult.ok) {
        const audioResp = await fetch(urlResult.value.url);
        if (audioResp.ok) {
          audioBuffer = await audioResp.arrayBuffer();
        } else {
          console.warn(
            `[fallback-transcription] Recall recording download failed ` +
              `(httpStatus=${audioResp.status}): sessionId=${sessionId}`,
          );
        }
      } else {
        console.warn(
          `[fallback-transcription] getRecordingDownloadUrl failed ` +
            `(error=${JSON.stringify(urlResult.error)}): sessionId=${sessionId}`,
        );
      }
    } catch (e) {
      console.warn(
        `[fallback-transcription] Recall download threw: sessionId=${sessionId}`,
        e,
      );
    }
  }

  if (!audioBuffer || audioBuffer.byteLength === 0) {
    console.warn(
      `[fallback-transcription] no audio available, skipping fallback: sessionId=${sessionId}`,
    );
    return 0;
  }

  // ステップ 2: チャンク分割 → transcribeAudio（ネットワーク呼び出しはロック外で実行）
  const chunks = splitIntoChunks(audioBuffer, CHUNK_SIZE_BYTES);
  const totalBytes = audioBuffer.byteLength;

  // セッション開始からの推定録音時間（ms）
  // セッションの started_at が設定されている場合はそこから計算。なければ 60 分をデフォルトとする。
  // 注: finalize 呼び出し時点では既に面接は終了しているため、Date.now() は録音終了後になる。
  //     この推定はセグメントの started_at_ms / ended_at_ms の近似値に使われるのみで、
  //     実際の音声タイムラインには影響しない（Whisper 転写は音声内容を認識する）。
  const estimatedDurationMs = session.started_at
    ? Math.max(1000, Date.now() - session.started_at.getTime())
    : 3_600_000; // デフォルト 1 時間

  const transcriptResults: Array<{
    chunkIdx: number;
    text: string;
    startedAtMs: number;
    endedAtMs: number;
  }> = [];

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx]!;
    try {
      const text = await transcribeAudio(
        new Blob([chunk], { type: 'audio/webm' }),
        { language: 'ja' },
      );

      if (!text || text.trim() === '') {
        console.info(
          `[fallback-transcription] empty transcript for chunk ${chunkIdx}: sessionId=${sessionId}`,
        );
        continue;
      }

      // チャンクの時間範囲推定（バイトオフセット比率で全録音時間を按分）
      // 音声ビットレートが一定と仮定した近似計算（design.md MVP の documented approximation）
      const byteStart = chunkIdx * CHUNK_SIZE_BYTES;
      const startedAtMs = Math.round((byteStart / totalBytes) * estimatedDurationMs);
      const endedAtMs = Math.round(
        (Math.min(byteStart + chunk.byteLength, totalBytes) / totalBytes) * estimatedDurationMs,
      );

      transcriptResults.push({ chunkIdx, text, startedAtMs, endedAtMs });
    } catch (e) {
      console.warn(
        `[fallback-transcription] transcribeAudio failed for chunk ${chunkIdx}: sessionId=${sessionId}`,
        e,
      );
    }
  }

  if (transcriptResults.length === 0) {
    console.warn(
      `[fallback-transcription] all chunks produced empty transcripts: sessionId=${sessionId}`,
    );
    return 0;
  }

  // ステップ 3: セグメント insert + フラッシュ（advisory lock 内でアトミックに実行）
  //
  // runWithSessionLock（pg_advisory_xact_lock）により、webhook や tick との並行実行を防ぐ。
  // finalize 中は新規セグメント到着はないはずだが、安全のためロックを使用する。
  let insertedCount = 0;

  try {
    await runWithSessionLock(sessionId, async (tx) => {
      // 3a. post_batch セグメント insert（冪等: source_id 衝突は onConflictDoNothing）
      for (const { chunkIdx, text, startedAtMs, endedAtMs } of transcriptResults) {
        const sourceId = `post_batch:${sessionId}:${chunkIdx}`;

        // seq はセッション内の連番。advisory lock 下で MAX(seq)+1 を計算することで直列化する。
        // （webhook transcript route と同一パターン）
        const seqResult = await tx.execute<{ next_seq: string }>(sql`
          SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
          FROM transcript_segment
          WHERE session_id = ${sessionId}
        `);
        const nextSeq = Number(seqResult.rows[0]?.next_seq ?? 1);

        const inserted = await tx
          .insert(schema.transcriptSegment)
          .values({
            session_id: sessionId,
            seq: nextSeq,
            source_id: sourceId,
            // 事後バッチ転写は話者分離なし → unknown（design.md 2.6 / Error Handling）
            // 4.2 の splitInterviewerCandidate pending-split パスで事後分離される
            speaker_role: 'unknown',
            speaker_label: null,
            text,
            started_at_ms: startedAtMs,
            ended_at_ms: endedAtMs,
            origin: 'post_batch',
            logical_turn_id: null,
          })
          .onConflictDoNothing({
            target: [
              schema.transcriptSegment.session_id,
              schema.transcriptSegment.source_id,
            ],
          })
          .returning();

        if (inserted.length > 0) {
          insertedCount++;
          console.info(
            `[fallback-transcription] inserted post_batch segment ` +
              `(chunkIdx=${chunkIdx}, seq=${nextSeq}): sessionId=${sessionId}`,
          );
        }
      }

      // 新規セグメントがゼロ（全て重複: 冪等再実行）→ フラッシュをスキップ
      if (insertedCount === 0) return;

      // 3b. 未消費セグメント（post_batch を含む）のフラッシュ → interview_turn 化
      // finalize-session.ts step ② と同じパターンで実行する
      const rawSegments = await tx
        .select()
        .from(schema.transcriptSegment)
        .where(
          and(
            eq(schema.transcriptSegment.session_id, sessionId),
            isNull(schema.transcriptSegment.logical_turn_id),
          ),
        )
        .orderBy(asc(schema.transcriptSegment.started_at_ms));

      if (rawSegments.length === 0) return;

      const segments: SegmentInput[] = rawSegments.map((s) => ({
        id: s.id,
        seq: s.seq,
        speakerRole: s.speaker_role,
        text: s.text,
        startedAtMs: s.started_at_ms,
        endedAtMs: s.ended_at_ms,
      }));

      // forceCloseTrailing=true: 末尾ターン候補も強制 emit（finalize フラッシュの標準動作）
      const closedTurns = evaluate({
        sessionId,
        segments,
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      if (closedTurns.length > 0) {
        await createWriteBackConsumer(sessionId)(closedTurns, tx);
        console.info(
          `[fallback-transcription] second flush created ${closedTurns.length} turn(s): sessionId=${sessionId}`,
        );
      }
    });
  } catch (e) {
    console.error(
      `[fallback-transcription] segment insert/flush failed (continuing to report): sessionId=${sessionId}`,
      e,
    );
    // best-effort: 失敗しても既存ターンベースでレポート生成へ続行（Req 5.5）
  }

  return insertedCount;
}

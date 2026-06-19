/**
 * POST /api/webhooks/recall/transcript?token={secret}
 *
 * Recall.ai ストリーミング STT の transcript.data（final のみ）を受信し、
 * transcript_segment テーブルへ冪等 insert する。
 *
 * 設計方針（design.md: WebhookIngestion）:
 * - 認証: URL クエリパラメータ `?token=` を verifyTranscriptToken で検証。失敗 → 401
 * - 応答は常に即時 200（認証失敗 401 / payload 不正 400 を除く）
 * - partial_data イベントおよび is_final=false のセグメントは no-op (200)
 * - sessionId ↔ bot_id 不一致は 200 + 破棄（再配信ループ防止）
 * - aborted セッションのイベントは破棄（Req 7.6）
 * - 冪等性: (session_id, source_id) 一意制約 + onConflictDoNothing
 * - seq 割り当て: pg_advisory_xact_lock(hashtext(session_id)::bigint) でトランザクション内直列化
 * - 話者正規化: 参加者名と面接官名（user.name / user_profile.display_name）の
 *   大小文字・空白を正規化した一致比較。一致 → interviewer / 不一致 → candidate / 不明 → unknown
 * - last_capture_event_at は受理した全イベント（insert 成功・重複 no-op）で更新（design.md 2.5）
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5
 * Design: WebhookIngestion API Contract / Event Contract / Data Models / Testing Strategy #1
 */

import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { verifyTranscriptToken } from '../../../../../lib/capture/recall-webhook-verify';

// ---------------------------------------------------------------------------
// Zod スキーマ: transcript.data / partial_data ペイロード
//
// 「tolerant」設計: 多くのフィールドを optional / nullable とし、
// Recall.ai プロバイダの実装差異や将来の変更に耐える。
// 必須フィールドは event と data.bot_id のみ。
// ---------------------------------------------------------------------------

const WordSchema = z
  .object({ text: z.string().optional().nullable() })
  .passthrough();

const TranscriptDataPayloadSchema = z.object({
  event: z.string(),
  data: z.object({
    bot_id: z.string(),
    transcript: z.object({
      /** 転写テキスト（直接提供されない場合は words から結合する） */
      text: z.string().optional().nullable(),
      /** 単語単位の転写（text が null の場合のフォールバック） */
      words: z.array(WordSchema).optional().nullable(),
      /** 発話参加者メタデータ */
      participant: z
        .object({
          id: z.string().optional().nullable(),
          name: z.string().optional().nullable(),
        })
        .optional()
        .nullable(),
      /** true = final セグメント（処理対象）/ false = partial（破棄） */
      is_final: z.boolean().optional().nullable(),
      /** 発話開始時刻（Unix タイムスタンプ 秒、浮動小数点） */
      start_time: z.number().optional().nullable(),
      /** 発話終了時刻（Unix タイムスタンプ 秒、浮動小数点） */
      end_time: z.number().optional().nullable(),
    }),
  }),
});

type TranscriptPayload = z.infer<typeof TranscriptDataPayloadSchema>;
type TranscriptBlock = TranscriptPayload['data']['transcript'];

// ---------------------------------------------------------------------------
// 話者ロール正規化
//
// 照合手順（Req 2.2, 2.3）:
//   1. 参加者名が存在しない → unknown
//   2. 面接官名が取得できない → unknown（比較基準なし）
//   3. 正規化後の名前が一致 → interviewer
//   4. 不一致 → candidate（別人の有名参加者）
//
// 正規化: 前後空白除去 + 連続空白を単一スペースに変換 + 小文字化
// ---------------------------------------------------------------------------

function normalizeForComparison(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveSpeakerRole(
  participantName: string | null | undefined,
  interviewerName: string | null | undefined,
): 'interviewer' | 'candidate' | 'unknown' {
  if (!participantName) return 'unknown';
  if (!interviewerName) return 'unknown';
  return normalizeForComparison(participantName) === normalizeForComparison(interviewerName)
    ? 'interviewer'
    : 'candidate';
}

// ---------------------------------------------------------------------------
// テキスト抽出
//
// 優先順位: transcript.text → words[*].text 結合 → 空文字列
// ---------------------------------------------------------------------------

function extractText(transcript: TranscriptBlock): string {
  if (transcript.text) return transcript.text;
  if (Array.isArray(transcript.words) && transcript.words.length > 0) {
    return transcript.words
      .map(w => w.text ?? '')
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

// ---------------------------------------------------------------------------
// source_id 導出
//
// 設計: "source_id = ボット ID + プロバイダのセグメント識別子/タイムスタンプ"
// 優先順位: start_time → end_time → text の先頭 100 文字
// start_time が存在する場合は再配信でも安定したキーになる。
// フォールバックはテキストを使うため完全な冪等性は保証されないが、
// final セグメントは通常 start_time を持つため実用上の問題はない。
// ---------------------------------------------------------------------------

function deriveSourceId(botId: string, transcript: TranscriptBlock): string {
  const key =
    transcript.start_time != null
      ? String(transcript.start_time)
      : transcript.end_time != null
        ? String(transcript.end_time)
        : (transcript.text?.slice(0, 100) ?? String(Date.now()));
  return `${botId}:${key}`;
}

// ---------------------------------------------------------------------------
// 相対ミリ秒変換
//
// payload の start_time / end_time は Unix タイムスタンプ（秒）。
// session.started_at との差分をミリ秒整数に変換する。
//
// 値が存在しない → 0（tolerant フォールバック、設計書に記載）
// session.started_at が null → 絶対タイムスタンプを ms に変換（相対化不能）
// 負値になる場合（started_at より前の発話）→ 0 にクランプ
// ---------------------------------------------------------------------------

function deriveRelativeMs(
  payloadTimeSecs: number | null | undefined,
  sessionStartedAt: Date | null,
): number {
  if (payloadTimeSecs == null) return 0;
  const absMs = Math.round(payloadTimeSecs * 1000);
  if (sessionStartedAt == null) return absMs;
  return Math.max(0, absMs - sessionStartedAt.getTime());
}

// ---------------------------------------------------------------------------
// POST ハンドラ
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // ------------------------------------------------------------------
  // 1. URL トークン検証（失敗 → 401）
  //    design.md: "transcript webhook: URL 埋め込みトークン（セッション毎に発行）"
  // ------------------------------------------------------------------
  const url = new URL(request.url);
  const rawToken = url.searchParams.get('token') ?? '';

  const tokenResult = verifyTranscriptToken(rawToken);
  if (!tokenResult.ok) {
    console.warn('[webhook/recall/transcript] token verification failed');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { sessionId } = tokenResult;

  // ------------------------------------------------------------------
  // 2. JSON パース（失敗 → 400）
  // ------------------------------------------------------------------
  let parsedJson: unknown;
  try {
    parsedJson = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 3. Zod バリデーション（失敗 → 400）
  //    design.md: "payload 全体を Zod 検証"
  // ------------------------------------------------------------------
  const parseResult = TranscriptDataPayloadSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    console.warn(
      '[webhook/recall/transcript] payload validation failed',
      parseResult.error.flatten(),
    );
    return NextResponse.json(
      { error: 'validation_failed', details: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  const {
    event,
    data: { bot_id: botId, transcript },
  } = parseResult.data;

  // ------------------------------------------------------------------
  // 4. Final-only フィルタ
  //    design.md: "transcript.partial_data は購読しない"
  //    "is_final=false のセグメントは no-op"
  // ------------------------------------------------------------------
  if (event === 'transcript.partial_data' || transcript.is_final === false) {
    console.info(
      `[webhook/recall/transcript] partial event skipped: event=${event}, is_final=${transcript.is_final}`,
    );
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // 5. セッション取得と bot_id 照合
  //    design.md: "metadata.sessionId と bot_id の DB 紐付けが一致しない場合は破棄"
  // ------------------------------------------------------------------
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, sessionId),
  });

  if (!session || session.bot_id !== botId) {
    console.warn(
      `[webhook/recall/transcript] session/bot mismatch: ` +
        `sessionId=${sessionId}, botId=${botId}, stored=${session?.bot_id ?? 'N/A'}`,
    );
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // 6. aborted / paused セッションは破棄
  //    - aborted: 中止後の受理拒否（Req 7.6, design.md: "aborted セッションのイベントは破棄"）
  //    - paused:  一時停止中の発言は記録しない（A案: 解析停止＋停止中の発言は破棄）
  // ------------------------------------------------------------------
  if (session.capture_status === 'aborted' || session.capture_status === 'paused') {
    console.info(
      `[webhook/recall/transcript] event discarded for ${session.capture_status} session: sessionId=${sessionId}`,
    );
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // 7. 話者ロール正規化（Req 2.2, 2.3）
  //    面接官名を user.name → user_profile.display_name のフォールバック順で取得
  // ------------------------------------------------------------------
  const interviewerRow = await db
    .select({
      name: schema.user.name,
      displayName: schema.userProfile.displayName,
    })
    .from(schema.user)
    .leftJoin(schema.userProfile, eq(schema.userProfile.userId, schema.user.id))
    .where(eq(schema.user.id, session.interviewer_id))
    .limit(1)
    .then(rows => rows[0] ?? null);

  const interviewerName = interviewerRow?.name ?? interviewerRow?.displayName ?? null;
  const participantName = transcript.participant?.name ?? null;
  const speakerRole = resolveSpeakerRole(participantName, interviewerName);

  // ------------------------------------------------------------------
  // 8. insert 用値の導出
  // ------------------------------------------------------------------
  const sourceId = deriveSourceId(botId, transcript);
  const text = extractText(transcript);
  const startedAtMs = deriveRelativeMs(transcript.start_time, session.started_at ?? null);
  const endedAtMs = deriveRelativeMs(transcript.end_time, session.started_at ?? null);

  // ------------------------------------------------------------------
  // 9. 冪等 insert（Req 2.1, 2.5）
  //
  //    pg_advisory_xact_lock でセッション単位の seq 割り当てを直列化し、
  //    重複 source_id は onConflictDoNothing で no-op にする。
  //
  //    ロック取得 → MAX(seq)+1 計算 → insert という流れを一トランザクション内で完結させる。
  //    duplicate no-op の場合、seq はスキップされる可能性があるが、
  //    これは許容される（設計書: "seq は到着順を反映; 下流は started_at_ms ソートで吸収"）。
  //
  //    design.md: "冪等性: (session_id, source_id) 一意制約。重複配信は no-op"
  //    design.md: "pg_advisory_xact_lock でターン処理を直列化"
  // ------------------------------------------------------------------
  await db.transaction(async (tx) => {
    // セッション ID のハッシュ値をアドバイザリロックキーとして使用
    // hashtext は int4 を返すため bigint にキャストして pg_advisory_xact_lock に渡す
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId})::bigint)`,
    );

    // セッション内の次の seq を計算（MAX(seq)+1、行がない場合は 1）
    const seqResult = await tx.execute<{ next_seq: string }>(sql`
      SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
      FROM transcript_segment
      WHERE session_id = ${sessionId}
    `);
    const nextSeq = Number(seqResult.rows[0]?.next_seq ?? 1);

    // (session_id, source_id) が重複する場合は no-op
    await tx
      .insert(schema.transcriptSegment)
      .values({
        session_id: sessionId,
        seq: nextSeq,
        source_id: sourceId,
        speaker_role: speakerRole,
        speaker_label: participantName,
        text,
        started_at_ms: startedAtMs,
        ended_at_ms: endedAtMs,
        origin: 'bot_realtime',
      })
      .onConflictDoNothing({
        target: [
          schema.transcriptSegment.session_id,
          schema.transcriptSegment.source_id,
        ],
      });
  });

  // ------------------------------------------------------------------
  // 10. last_capture_event_at を更新（重複 no-op の場合も更新）
  //     design.md: "last_capture_event_at を更新"
  //     Req 2.5: staleTranscript 判定のリセットに使用
  // ------------------------------------------------------------------
  await db
    .update(schema.interviewSession)
    .set({ last_capture_event_at: new Date() })
    .where(eq(schema.interviewSession.id, sessionId));

  // ------------------------------------------------------------------
  // 11. 常に即時 200 を返す
  //     design.md: "応答は常に即時 200"
  // ------------------------------------------------------------------
  return NextResponse.json({ ok: true });
}

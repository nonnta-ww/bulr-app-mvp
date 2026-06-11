/**
 * セグメンタ tick — live-state ポーリング受信時の沈黙時計（task 3.3）。
 *
 * 役割:
 *   キャプチャ進行中（recording）のセッションに対して、ポーリング受信時に
 *   「候補者発話後の沈黙」を検知し、未消費 final セグメントの末尾を論理ターンとして確定する。
 *   セグメンタは「イベント着弾」と「ポーリング tick」の 2 系統で起動する（design.md TurnSegmenter）。
 *   沈黙はイベントを生まないため、ポーリング tick が時計の役割を担う。
 *
 * 沈黙判定:
 *   `now - last_capture_event_at > silenceGapMs`（デフォルト 4000ms）
 *   `last_capture_event_at` は transcript 受信ルートが受理イベントごとに更新する。
 *   null の場合（セグメント未到達）→ no-op。
 *
 * コンシューマシーム（task 4.2 への接続点）:
 *   確定した LogicalTurn[] をコンシューマ関数に渡す。
 *   デフォルトは `defaultTickConsumer`（ログ + 何もしない）。
 *   task 4.2 が実際の write-back（segment claim + interview_turn insert）を注入する。
 *
 * 冪等性:
 *   `runWithSessionLock` で advisory lock → ロック内で未消費セグメントを再読み込み（防衛的再チェック）
 *   → `evaluate({ forceCloseTrailing: true })` → コンシューマ呼び出し。
 *   プレースホルダーコンシューマはセグメントを claim しないため、
 *   重複 tick は同一の LogicalTurn を再生成する。本当の重複排除は task 4.2 の
 *   `interview_turn.turn_fingerprint` 一意制約が担う。
 *
 * 耐障害性:
 *   tick 全体を try/catch で包む。失敗しても呼び出し元（live-state レスポンス）には伝播しない。
 *
 * Requirements: 3.3
 * Design: LiveStateAPI（セグメンタ tick の起点）/ TurnSegmenter（起動トリガ 2 系統）
 *         System Flows（ボットキャプチャと論理ターン処理）
 */

import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import {
  DEFAULT_SEGMENTER_CONFIG,
  evaluate,
  runWithSessionLock,
  type LogicalTurn,
  type SegmentInput,
  type SegmenterConfig,
} from './segmenter';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * Drizzle トランザクション型エイリアス。
 * `db.transaction()` のコールバック引数の型を導出する。
 */
type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * tick コンシューマのシーム型（task 4.2 が実装する write-back 契約）。
 *
 * ### TASK 4.2 の実装義務
 * task 4.2 でこのシームに注入するコンシューマは以下を行う必要がある:
 *
 * 1. **Segment claim**: `transcript_segment` の `logical_turn_id` を設定する。
 *    `UPDATE transcript_segment SET logical_turn_id = ? WHERE id IN (?) AND logical_turn_id IS NULL`
 *    — `AND logical_turn_id IS NULL` が並行クレーム時の冪等ガードになる。
 *    更新行数 = 0 の場合（他の tick/webhook に先を越された）→ 処理を放棄する。
 *
 * 2. **interview_turn insert**: `turn_fingerprint` 一意制約付きで upsert/insert する。
 *    重複 fingerprint は一意制約違反として適切に処理する（冪等）。
 *
 * 3. **TurnPipeline 起動**: `analyzeTurn → aggregatePatternCoverage →
 *    proposeNextQuestions` の LLM 編成を実行する（task 4.3 以降）。
 *
 * @param turns - evaluate() が確定した論理ターンのリスト（forceCloseTrailing=true）
 * @param tx    - 呼び出し元の advisory lock トランザクション（segment claim と同一 tx に乗せる）
 */
export type TickConsumer = (turns: LogicalTurn[], tx: DrizzleTransaction) => Promise<void>;

/**
 * `runSegmenterTick` の入力パラメータ。
 */
export interface SegmenterTickInput {
  /** 対象セッション UUID */
  sessionId: string;
  /**
   * 壁時計時刻（epoch ms）。テストで注入可能。
   * 省略時は `Date.now()`。
   */
  now?: number;
  /**
   * セグメンテーション設定の部分的なオーバーライド。
   * `DEFAULT_SEGMENTER_CONFIG` とマージして使用する。
   */
  config?: Partial<SegmenterConfig>;
  /**
   * 論理ターンを受け取るコンシューマ。
   * 省略時は `defaultTickConsumer`（ログ + no-op）。
   * task 4.2 が実際の write-back コンシューマを注入する。
   */
  consumer?: TickConsumer;
}

// ---------------------------------------------------------------------------
// デフォルトコンシューマ（task 3.3 のプレースホルダー）
// ---------------------------------------------------------------------------

/**
 * デフォルト tick コンシューマ（task 3.3 用プレースホルダー）。
 *
 * 確定した論理ターンをログ出力するだけで何もしない。
 * セグメントの claim も interview_turn への書き戻しも行わない。
 *
 * 注意: これは consumer 未指定時のフォールバック。本番経路では live-state route /
 * finalize-session が `createWriteBackConsumer(sessionId)`（turn-pipeline.ts）を渡し、
 * そちらが claim + interview_turn 書き戻し + LLM 編成を行う。
 * このプレースホルダーはセグメントを claim しないため繰り返し tick は同じ LogicalTurn
 * を返すが、実際の重複排除は interview_turn.turn_fingerprint 一意制約が担う。
 */
const defaultTickConsumer: TickConsumer = async (turns) => {
  console.info(
    `[segmenter-tick] tick closed ${turns.length} turn(s) — using no-op default consumer`,
  );
};

// ---------------------------------------------------------------------------
// runSegmenterTick — メイン実装
// ---------------------------------------------------------------------------

/**
 * セグメンタ tick を実行する。
 *
 * live-state GET ハンドラから呼び出される（design.md の "GET に副作用を持たせる例外"）。
 * レスポンス生成とは独立して実行し（先にレスポンスを構築してから tick を await する）、
 * tick の失敗はレスポンスに影響を与えない（try/catch で吸収）。
 *
 * @see SegmenterTickInput
 */
export async function runSegmenterTick(input: SegmenterTickInput): Promise<void> {
  const { sessionId, now = Date.now(), config, consumer = defaultTickConsumer } = input;

  try {
    // ------------------------------------------------------------------
    // 1. セッション読み込み
    //    capture_status と last_capture_event_at を取得する。
    // ------------------------------------------------------------------
    const session = await db.query.interviewSession.findFirst({
      where: eq(schema.interviewSession.id, sessionId),
    });

    if (!session) return; // セッション未存在 → no-op

    // ------------------------------------------------------------------
    // 2. アクティブキャプチャ確認
    //    recording 以外（idle / bot_joining / stopping / stopped / failed / aborted）→ no-op
    // ------------------------------------------------------------------
    if (session.capture_status !== 'recording') return;

    // ------------------------------------------------------------------
    // 3. 沈黙時計チェック
    //
    //    last_capture_event_at（受理セグメントの最終更新時刻）を活動基準として使用する。
    //    null の場合はまだセグメントが届いていない → 未消費セグメントもない → no-op。
    //
    //    `now - last_capture_event_at > silenceGapMs` が true → 沈黙確定 → 次のステップへ
    //    false → まだ発話中の可能性 → no-op
    // ------------------------------------------------------------------
    if (session.last_capture_event_at === null) return;

    const silenceGapMs = config?.silenceGapMs ?? DEFAULT_SEGMENTER_CONFIG.silenceGapMs;
    const timeSinceActivity = now - session.last_capture_event_at.getTime();
    if (timeSinceActivity <= silenceGapMs) return; // まだ沈黙閾値未達 → no-op

    // ------------------------------------------------------------------
    // 4. 未消費セグメントの事前チェック（ロック取得前の軽量スキャン）
    //    未消費セグメントが 0 件なら advisory lock の取得コストを避けて早期リターン。
    // ------------------------------------------------------------------
    const preCheckRow = await db.query.transcriptSegment.findFirst({
      where: and(
        eq(schema.transcriptSegment.session_id, sessionId),
        isNull(schema.transcriptSegment.logical_turn_id),
      ),
    });
    if (!preCheckRow) return; // 未消費セグメントなし → no-op

    // ------------------------------------------------------------------
    // 5. advisory lock 内でセグメント再読み込み + evaluate + コンシューマ呼び出し
    //
    //    ロック取得後に未消費セグメントを再読み込みする（防衛的再チェック）。
    //    concurrent webhook/tick が先に消費した場合に備える。
    //
    //    evaluate() に forceCloseTrailing=true を渡す:
    //      沈黙時計が閾値超過を確認済みのため、末尾ターンも強制的に emit してよい。
    // ------------------------------------------------------------------
    const mergedConfig: SegmenterConfig = {
      ...DEFAULT_SEGMENTER_CONFIG,
      ...config,
    };

    await runWithSessionLock(sessionId, async (tx) => {
      // ロック取得後に再読み込み（他の tick/webhook による state 変化を吸収）
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

      if (rawSegments.length === 0) return; // 他の tick/webhook が消費済み → no-op

      // DB 行を SegmentInput に変換
      const segments: SegmentInput[] = rawSegments.map((s) => ({
        id: s.id,
        seq: s.seq,
        speakerRole: s.speaker_role,
        text: s.text,
        startedAtMs: s.started_at_ms,
        endedAtMs: s.ended_at_ms,
      }));

      // 沈黙確定 → forceCloseTrailing=true で末尾ターンも emit する
      const closedTurns = evaluate({
        sessionId,
        segments,
        config: mergedConfig,
        forceCloseTrailing: true,
      });

      if (closedTurns.length === 0) return; // 確定ターンなし → no-op

      // コンシューマに渡す（task 4.2 が segment claim + interview_turn write-back を注入）
      await consumer(closedTurns, tx);
    });
  } catch (error) {
    // tick の失敗はレスポンスに伝播させない（design.md: "tick はレスポンス生成と独立"）
    console.error('[segmenter-tick] tick failed, continuing:', error);
  }
}

/**
 * segmenter-tick.ts の統合テスト（DB バックド）。
 *
 * task 3.3 — live-state tick（沈黙の時計）の実装を検証する。
 *
 * テスト観点:
 * (1) Headline (3.3): 候補者発話後に沈黙・後続イベントなし
 *       → tick によりターンが確定してコンシューマが呼ばれる
 * (2) 非沈黙（silenceGap 未満）→ コンシューマ不呼び出し（no-op）
 * (3) 非アクティブキャプチャ（recording 以外）→ no-op
 * (4) 並行/冪等性: 同一セッションへの同時 tick → クラッシュなし・一貫した出力
 *     （プレースホルダーコンシューマはセグメント未 claim のため同一ターンを重複検知する。
 *      本当の重複排除は task 4.2 の turn_fingerprint 一意制約で行われる）
 *
 * Requirements: 3.3
 * Design: LiveStateAPI（セグメンタ tick の起点）/ TurnSegmenter（起動トリガ 2 系統）
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。vitest Node 環境では空モックに置換。
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { runSegmenterTick, type TickConsumer } from './segmenter-tick';
import type { LogicalTurn } from './segmenter';

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('runSegmenterTick — 統合テスト（DB バックド）', () => {
  let userId: string;
  let sessionId: string;
  /**
   * セッションの last_capture_event_at（固定値）。
   * silence clock の基準時刻として使用する。
   * beforeEach で Date.now() - 60_000（60 秒前）に設定する。
   */
  let lastCaptureEventAt: Date;

  // -------------------------------------------------------------------------
  // beforeEach / afterEach: テストごとに独立したユーザーとセッションを作成・削除
  // -------------------------------------------------------------------------

  beforeEach(async () => {
    if (!process.env['DATABASE_URL']) return;

    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();
    // 60 秒前に最後のキャプチャイベントがあったと仮定（確実に silenceGap を超える）
    lastCaptureEventAt = new Date(Date.now() - 60_000);

    // Better Auth ユーザー（面接官）を挿入
    await db.insert(schema.user).values({
      id: userId,
      email: `tick-test-${userId}@example.com`,
      emailVerified: false,
      name: '面接官 一郎',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 面接セッション（recording 状態、last_capture_event_at = 60 秒前）
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: userId,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'recording',
      started_at: new Date(Date.now() - 120_000), // 2 分前に開始
      last_capture_event_at: lastCaptureEventAt,
    });
  });

  afterEach(async () => {
    if (!process.env['DATABASE_URL']) return;

    // FK 制約に従い子テーブルを先に削除
    await db
      .delete(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  // -------------------------------------------------------------------------
  // ヘルパー: 面接官 Q + 候補者 A のセグメントペアを挿入する
  // -------------------------------------------------------------------------

  async function seedQASegments(): Promise<{ qId: string; aId: string }> {
    const qId = crypto.randomUUID();
    const aId = crypto.randomUUID();

    // Q: 面接官の質問セグメント
    await db.insert(schema.transcriptSegment).values({
      id: qId,
      session_id: sessionId,
      seq: 1,
      source_id: `src-q-${qId}`,
      speaker_role: 'interviewer',
      speaker_label: '面接官 一郎',
      text: 'バックエンドエンジニアとしての経験について教えてください。',
      started_at_ms: 1000,
      ended_at_ms: 4000,
      origin: 'bot_realtime',
      // logical_turn_id: NULL → 未消費
    });

    // A: 候補者の回答セグメント（minAnswerChars=40 を超えるテキスト）
    await db.insert(schema.transcriptSegment).values({
      id: aId,
      session_id: sessionId,
      seq: 2,
      source_id: `src-a-${aId}`,
      speaker_role: 'candidate',
      speaker_label: '候補者 花子',
      text: '主にGoとPythonを使って、分散システムの設計と実装を担当してきました。マイクロサービスアーキテクチャの経験も豊富です。',
      started_at_ms: 5000,
      ended_at_ms: 12000,
      origin: 'bot_realtime',
      // logical_turn_id: NULL → 未消費
    });

    return { qId, aId };
  }

  // =========================================================================
  // (1) Headline (3.3): 沈黙検知 → セグメンタ起動 → コンシューマ呼び出し
  //
  // 「候補者発話後に沈黙、後続イベントなし → tick によりターンが確定する」
  // =========================================================================

  describe('Headline (3.3): 沈黙後にターンが確定する', () => {
    it('候補者発話後に沈黙（silenceGap 超過）→ tick がセグメンタを起動しコンシューマが呼ばれる', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const { qId, aId } = await seedQASegments();

      const receivedTurns: LogicalTurn[] = [];
      const spyConsumer: TickConsumer = vi.fn(async (turns) => {
        receivedTurns.push(...turns);
      });

      // now = lastCaptureEventAt + 5000ms (5000 > 4000 → 沈黙確定)
      const silentNow = lastCaptureEventAt.getTime() + 5000;

      await runSegmenterTick({
        sessionId,
        now: silentNow,
        consumer: spyConsumer,
      });

      // コンシューマが 1 回呼ばれること
      expect(spyConsumer).toHaveBeenCalledOnce();
      expect(receivedTurns).toHaveLength(1);

      const turn = receivedTurns[0]!;

      // Q セグメントが質問に含まれる
      expect(turn.question.segmentIds).toContain(qId);
      expect(turn.question.speakerRole).toBe('interviewer');

      // A セグメントが回答に含まれる
      expect(turn.answer.segmentIds).toContain(aId);
      expect(turn.answer.speakerRole).toBe('candidate');

      // fingerprint が存在する（冪等キー）
      expect(typeof turn.fingerprint).toBe('string');
      expect(turn.fingerprint.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // (2) 非沈黙（silenceGap 未満）→ no-op
  // =========================================================================

  describe('非沈黙 → no-op', () => {
    it('now - lastCaptureEventAt = 1000ms（< 4000ms silenceGap）→ コンシューマは呼ばれない', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      await seedQASegments();

      const spyConsumer: TickConsumer = vi.fn(async () => {});

      // now = lastCaptureEventAt + 1000ms (1000 < 4000 → 沈黙ではない)
      const notSilentNow = lastCaptureEventAt.getTime() + 1000;

      await runSegmenterTick({
        sessionId,
        now: notSilentNow,
        consumer: spyConsumer,
      });

      expect(spyConsumer).not.toHaveBeenCalled();
    });

    it('now = lastCaptureEventAt（ちょうど境界値 = 0ms）→ コンシューマは呼ばれない', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      await seedQASegments();

      const spyConsumer: TickConsumer = vi.fn(async () => {});

      // now = lastCaptureEventAt（0ms 差 → 非沈黙）
      const boundaryNow = lastCaptureEventAt.getTime();

      await runSegmenterTick({
        sessionId,
        now: boundaryNow,
        consumer: spyConsumer,
      });

      expect(spyConsumer).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // (3) 非アクティブキャプチャ → no-op
  // =========================================================================

  describe('非アクティブキャプチャ → no-op', () => {
    it.each(['idle', 'bot_joining', 'stopping', 'stopped', 'failed', 'aborted'] as const)(
      'capture_status="%s" → コンシューマは呼ばれない',
      async (status) => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        // capture_status を更新
        await db
          .update(schema.interviewSession)
          .set({ capture_status: status })
          .where(eq(schema.interviewSession.id, sessionId));

        await seedQASegments();

        const spyConsumer: TickConsumer = vi.fn(async () => {});
        const silentNow = lastCaptureEventAt.getTime() + 5000;

        await runSegmenterTick({
          sessionId,
          now: silentNow,
          consumer: spyConsumer,
        });

        expect(spyConsumer).not.toHaveBeenCalled();
      },
    );
  });

  // =========================================================================
  // (4) 並行/冪等性
  //
  // 2 つの同時 tick が同一セッションを処理する。
  // advisory lock により直列化されるため両者が同じ未消費セグメントを見る。
  // プレースホルダーコンシューマはセグメントを claim しないため、
  // 2 回目の tick も同じセグメントを再評価して同一 fingerprint のターンを返す。
  //
  // NOTE: 本当の重複排除は task 4.2 の turn_fingerprint 一意制約が担う。
  // このテストはクラッシュなし + 一貫した出力（同一 fingerprint）を確認する。
  // =========================================================================

  describe('並行/冪等性', () => {
    it('同一セッションへの同時 tick → クラッシュなし・全ターンが同一 fingerprint を持つ', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      await seedQASegments();

      const allTurns: LogicalTurn[] = [];
      const spyConsumer: TickConsumer = vi.fn(async (turns) => {
        allTurns.push(...turns);
      });

      const silentNow = lastCaptureEventAt.getTime() + 5000;

      // 2 つの tick を同時に起動（advisory lock で直列化される）
      await Promise.all([
        runSegmenterTick({ sessionId, now: silentNow, consumer: spyConsumer }),
        runSegmenterTick({ sessionId, now: silentNow, consumer: spyConsumer }),
      ]);

      // クラッシュなし: Promise.all が resolve している時点で成功

      // コンシューマが少なくとも 1 回は呼ばれていること
      expect(spyConsumer).toHaveBeenCalled();

      // 受け取ったターンは全て同一の fingerprint（同一セグメント構成 → 決定論）
      const fingerprints = new Set(allTurns.map((t) => t.fingerprint));
      expect(fingerprints.size).toBe(1);
    });
  });

  // =========================================================================
  // (5) エッジケース: 未消費セグメントなし → no-op
  // =========================================================================

  describe('未消費セグメントなし → no-op', () => {
    it('transcript_segment が存在しない場合 → コンシューマは呼ばれない', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      // セグメントを挿入しない
      const spyConsumer: TickConsumer = vi.fn(async () => {});
      const silentNow = lastCaptureEventAt.getTime() + 5000;

      await runSegmenterTick({
        sessionId,
        now: silentNow,
        consumer: spyConsumer,
      });

      expect(spyConsumer).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // (6) last_capture_event_at が null → no-op
  // =========================================================================

  describe('last_capture_event_at が null → no-op', () => {
    it('last_capture_event_at=null の場合 → コンシューマは呼ばれない', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      // last_capture_event_at を null に更新
      await db
        .update(schema.interviewSession)
        .set({ last_capture_event_at: null })
        .where(eq(schema.interviewSession.id, sessionId));

      await seedQASegments();

      const spyConsumer: TickConsumer = vi.fn(async () => {});
      const anyNow = Date.now();

      await runSegmenterTick({
        sessionId,
        now: anyNow,
        consumer: spyConsumer,
      });

      expect(spyConsumer).not.toHaveBeenCalled();
    });
  });
});

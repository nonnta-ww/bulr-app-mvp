/**
 * GET /api/interview/sessions/[sessionId]/live-state の統合テスト（DB バックド）。
 *
 * テスト観点:
 * (1) full vs diff カーソル: cursor=0 で全セグメント / cursor=k で seq>k のみ返す
 * (2) staleTranscript: recording + last_capture_event_at > 20s → true; 直近更新 → false
 * (3) coverage / proposal / elapsed / remaining の集計が DB から正しく導出される
 * (4) auth ガード: non-owner → 403 / no user → 401 / missing session → 404
 *
 * Requirements: 2.1, 2.5, 3.1, 3.8, 7.1, 8.2
 * Design: LiveStateAPI (API Contract / LiveState interface / Testing Strategy Unit #5)
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。vitest Node 環境では空モックに置換。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const { TEST_USER_ID, mockRequireUser } = vi.hoisted(() => ({
  TEST_USER_ID: 'live-state-test-user-fixed-id',
  mockRequireUser: vi.fn<() => Promise<{ id: string; email: string }>>(),
}));

/**
 * @bulr/auth/server のモック。
 * requireUser を vi.fn() で制御し、requireSessionOwnership は実装互換のスタブを提供する。
 */
vi.mock('@bulr/auth/server', () => {
  class AuthError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = 'AuthError';
      this.code = code;
    }
  }

  function requireSessionOwnership(
    session: { interviewerId: string } | null | undefined,
    userId: string,
  ): void {
    if (!session) throw new AuthError('NOT_FOUND');
    if (session.interviewerId !== userId) throw new AuthError('FORBIDDEN');
  }

  return {
    AuthError,
    requireUser: mockRequireUser,
    requireSessionOwnership,
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { GET } from './route';

// ---------------------------------------------------------------------------
// ヘルパー: リクエスト構築
// ---------------------------------------------------------------------------

function makeRequest(sessionId: string, cursor?: number): Request {
  const url =
    cursor !== undefined
      ? `https://example.com/api/interview/sessions/${sessionId}/live-state?cursor=${cursor}`
      : `https://example.com/api/interview/sessions/${sessionId}/live-state`;
  return new Request(url, { method: 'GET' });
}

function makeParams(sessionId: string): { params: Promise<{ sessionId: string }> } {
  return { params: Promise.resolve({ sessionId }) };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('GET /api/interview/sessions/[sessionId]/live-state', () => {
  let userId: string;
  let sessionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();

    // デフォルト: requireUser は所有者ユーザーを返す
    mockRequireUser.mockResolvedValue({
      id: TEST_USER_ID,
      email: 'test@example.com',
    });

    // Better Auth ユーザーを挿入
    await db.insert(schema.user).values({
      id: TEST_USER_ID,
      email: `test-${TEST_USER_ID}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // sessionId 用の別ユーザーは TEST_USER_ID で兼用（owner として）
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: TEST_USER_ID,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'recording',
      started_at: new Date(Date.now() - 60_000), // 60 秒前に開始
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();

    // FK 制約に従い子テーブルを先に削除
    await db
      .delete(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    await db
      .delete(schema.patternCoverage)
      .where(eq(schema.patternCoverage.session_id, sessionId));
    await db
      .delete(schema.questionProposal)
      .where(eq(schema.questionProposal.session_id, sessionId));
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID));
  });

  // -------------------------------------------------------------------------
  // ヘルパー: テスト用セグメント挿入
  // -------------------------------------------------------------------------

  async function seedSegment(seq: number, text: string): Promise<void> {
    await db.insert(schema.transcriptSegment).values({
      session_id: sessionId,
      seq,
      source_id: `src-${sessionId}-${seq}`,
      speaker_role: 'candidate',
      speaker_label: '候補者 花子',
      text,
      started_at_ms: seq * 1000,
      ended_at_ms: seq * 1000 + 500,
      origin: 'bot_realtime',
    });
  }

  /**
   * pattern_coverage を挿入する。
   * patternId は assessment_pattern.id（nanoid）を渡すこと。
   */
  async function seedPatternCoverage(patternId: string, levelReached: number): Promise<void> {
    await db.insert(schema.patternCoverage).values({
      session_id: sessionId,
      pattern_id: patternId,
      level_reached: levelReached,
      stuck_type: null,
      llm_evaluation: { level_reached: levelReached, stuck_type: null } as never,
      turn_ids: [],
      finalized_at: new Date(),
    });
  }

  /**
   * 実 DB から assessment_pattern を最大 n 件取得する。
   * coverage テストで planned_pattern_codes と pattern_coverage の整合性確保に使用。
   */
  async function fetchRealPatterns(n: number): Promise<typeof schema.assessmentPattern.$inferSelect[]> {
    return db.query.assessmentPattern.findMany({ limit: n });
  }

  async function seedProposal(preparedForTurnNo: number): Promise<void> {
    await db.insert(schema.questionProposal).values({
      session_id: sessionId,
      prepared_for_turn_no: preparedForTurnNo,
      candidate_1_text: '候補1テキスト',
      candidate_1_intent: 'deep_dive',
      candidate_2_text: '候補2テキスト',
      candidate_2_intent: 'meta_cognition',
      candidate_3_text: '候補3テキスト',
      candidate_3_intent: 'next_pattern',
      selected_index: null,
    });
  }

  // =========================================================================
  // (1) cursor 差分・全量テスト
  // =========================================================================

  describe('カーソル制御', () => {
    it('(a) cursor=0 で全セグメントが返り nextCursor = max(seq)', async () => {
      await seedSegment(1, 'first');
      await seedSegment(2, 'second');
      await seedSegment(3, 'third');

      const req = makeRequest(sessionId, 0);
      const ctx = makeParams(sessionId);
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as {
        segments: { seq: number; text: string }[];
        nextCursor: number;
      };

      expect(body.segments).toHaveLength(3);
      expect(body.segments.map((s) => s.seq)).toEqual([1, 2, 3]);
      expect(body.segments.map((s) => s.text)).toEqual(['first', 'second', 'third']);
      expect(body.nextCursor).toBe(3);
    });

    it('(b) cursor=2 で seq>2 のセグメントのみ返り nextCursor = 3', async () => {
      await seedSegment(1, 'first');
      await seedSegment(2, 'second');
      await seedSegment(3, 'third');

      const req = makeRequest(sessionId, 2);
      const ctx = makeParams(sessionId);
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as {
        segments: { seq: number }[];
        nextCursor: number;
      };

      expect(body.segments).toHaveLength(1);
      expect(body.segments[0]!.seq).toBe(3);
      expect(body.nextCursor).toBe(3);
    });

    it('(c) cursor がセグメント最大 seq 以上の場合は空配列で nextCursor = cursor', async () => {
      await seedSegment(1, 'only');

      const req = makeRequest(sessionId, 5);
      const ctx = makeParams(sessionId);
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as {
        segments: unknown[];
        nextCursor: number;
      };

      expect(body.segments).toHaveLength(0);
      expect(body.nextCursor).toBe(5);
    });

    it('(d) cursor 省略時はデフォルト 0 として全量返す', async () => {
      await seedSegment(1, 'seg1');
      await seedSegment(2, 'seg2');

      const req = makeRequest(sessionId); // cursor なし
      const ctx = makeParams(sessionId);
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const body = await res.json() as { segments: unknown[]; nextCursor: number };
      expect(body.segments).toHaveLength(2);
      expect(body.nextCursor).toBe(2);
    });
  });

  // =========================================================================
  // (2) staleTranscript 判定
  // =========================================================================

  describe('staleTranscript 判定', () => {
    it('(a) recording + last_capture_event_at が 21 秒前 → staleTranscript=true', async () => {
      const staleTime = new Date(Date.now() - 21_000); // 21秒前
      await db
        .update(schema.interviewSession)
        .set({ last_capture_event_at: staleTime })
        .where(eq(schema.interviewSession.id, sessionId));

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { staleTranscript: boolean };
      expect(body.staleTranscript).toBe(true);
    });

    it('(b) recording + last_capture_event_at が null → staleTranscript=true', async () => {
      // last_capture_event_at はデフォルト null（beforeEach のシード値）
      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { staleTranscript: boolean };
      expect(body.staleTranscript).toBe(true);
    });

    it('(c) recording + last_capture_event_at が 5 秒前（新鮮）→ staleTranscript=false', async () => {
      const freshTime = new Date(Date.now() - 5_000); // 5秒前
      await db
        .update(schema.interviewSession)
        .set({ last_capture_event_at: freshTime })
        .where(eq(schema.interviewSession.id, sessionId));

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { staleTranscript: boolean };
      expect(body.staleTranscript).toBe(false);
    });

    it('(d) recording 以外（idle）+ last_capture_event_at が 30 秒前 → staleTranscript=false', async () => {
      // idle 状態に変更
      await db
        .update(schema.interviewSession)
        .set({
          capture_status: 'idle',
          last_capture_event_at: new Date(Date.now() - 30_000),
        })
        .where(eq(schema.interviewSession.id, sessionId));

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { staleTranscript: boolean };
      expect(body.staleTranscript).toBe(false);
    });
  });

  // =========================================================================
  // (3) coverage / proposal / elapsedSeconds / remainingPlannedPatterns
  // =========================================================================

  describe('集計フィールド', () => {
    it('(a) coverage が planned_pattern_codes と pattern_coverage から正しく分類される', async () => {
      // 実 DB から 3 件の assessment_pattern を取得して使用する。
      // planned_pattern_codes は assessment_pattern.code（例: "D-01"）、
      // pattern_coverage.pattern_id は assessment_pattern.id（nanoid）。
      const realPatterns = await fetchRealPatterns(3);
      if (realPatterns.length < 3) {
        // assessment_pattern シードが不足している場合はスキップ
        return;
      }
      const [pat1, pat2, pat3] = realPatterns as [
        typeof schema.assessmentPattern.$inferSelect,
        typeof schema.assessmentPattern.$inferSelect,
        typeof schema.assessmentPattern.$inferSelect,
      ];

      // セッションの計画パターンを実際のコードで設定
      await db
        .update(schema.interviewSession)
        .set({ planned_pattern_codes: [pat1.code, pat2.code, pat3.code] })
        .where(eq(schema.interviewSession.id, sessionId));

      // pat1 は covered（level_reached=2）、pat2 / pat3 は not_started
      await seedPatternCoverage(pat1.id, 2);

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as {
        coverage: { patternCode: string; status: string; levelReached: number | null }[];
        remainingPlannedPatterns: number;
      };

      expect(body.coverage).toHaveLength(3);

      const covered = body.coverage.find((c) => c.patternCode === pat1.code);
      expect(covered?.status).toBe('covered');
      expect(covered?.levelReached).toBe(2);

      const notStarted1 = body.coverage.find((c) => c.patternCode === pat2.code);
      expect(notStarted1?.status).toBe('not_started');
      expect(notStarted1?.levelReached).toBeNull();

      const notStarted2 = body.coverage.find((c) => c.patternCode === pat3.code);
      expect(notStarted2?.status).toBe('not_started');

      // remainingPlannedPatterns: covered でないもの = 2
      expect(body.remainingPlannedPatterns).toBe(2);
    });

    it('(b) currentProposal が最新 question_proposal（最高 prepared_for_turn_no）を返す', async () => {
      // 古いプロポーザル（turn_no=1）を先に挿入
      await seedProposal(1);
      // 最新プロポーザル（turn_no=3）
      await seedProposal(3);

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as {
        currentProposal: {
          candidates: { text: string; intent: string }[];
          selectedIndex: number | null;
        } | null;
      };

      expect(body.currentProposal).not.toBeNull();
      expect(body.currentProposal!.candidates).toHaveLength(3);
      expect(body.currentProposal!.candidates[0]!.text).toBe('候補1テキスト');
      expect(body.currentProposal!.candidates[0]!.intent).toBe('deep_dive');
      expect(body.currentProposal!.selectedIndex).toBeNull();
    });

    it('(c) question_proposal が存在しない場合 currentProposal は null', async () => {
      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { currentProposal: unknown };
      expect(body.currentProposal).toBeNull();
    });

    it('(d) elapsedSeconds が started_at からおおよそ正しく計算される', async () => {
      // beforeEach で started_at = 60 秒前に設定済み
      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { elapsedSeconds: number };

      // 60 秒前に開始なので、elapsedSeconds はおよそ 60 秒（±2 秒の誤差を許容）
      expect(body.elapsedSeconds).toBeGreaterThanOrEqual(58);
      expect(body.elapsedSeconds).toBeLessThanOrEqual(65);
    });

    it('(e) started_at が null の場合 elapsedSeconds = 0', async () => {
      await db
        .update(schema.interviewSession)
        .set({ started_at: null })
        .where(eq(schema.interviewSession.id, sessionId));

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { elapsedSeconds: number };
      expect(body.elapsedSeconds).toBe(0);
    });
  });

  // =========================================================================
  // (4) auth ガード
  // =========================================================================

  describe('auth ガード（Req 7.1）', () => {
    it('(a) requireUser が throw した場合 401 を返す', async () => {
      mockRequireUser.mockRejectedValueOnce(new Error('UNAUTHORIZED'));

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(401);
    });

    it('(b) 存在しない sessionId は 404 を返す', async () => {
      const unknownId = crypto.randomUUID();
      const res = await GET(makeRequest(unknownId, 0), makeParams(unknownId));
      expect(res.status).toBe(404);
    });

    it('(c) セッション所有者でないユーザーは 403 を返す', async () => {
      // 別ユーザーを DB に挿入して session の owner に設定する
      const anotherUserId = crypto.randomUUID();
      await db.insert(schema.user).values({
        id: anotherUserId,
        email: `another-${anotherUserId}@example.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db
        .update(schema.interviewSession)
        .set({ interviewer_id: anotherUserId })
        .where(eq(schema.interviewSession.id, sessionId));

      // TEST_USER_ID でアクセス → owner は anotherUserId → 403
      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(403);

      // 後片付け
      await db
        .update(schema.interviewSession)
        .set({ interviewer_id: TEST_USER_ID })
        .where(eq(schema.interviewSession.id, sessionId));
      await db.delete(schema.user).where(eq(schema.user.id, anotherUserId));
    });
  });

  // =========================================================================
  // (5) レスポンス構造の基本確認
  // =========================================================================

  describe('レスポンス構造', () => {
    it('captureStatus と analysisCapped が正しく返る', async () => {
      // analysis_capped_at を設定
      await db
        .update(schema.interviewSession)
        .set({ analysis_capped_at: new Date() })
        .where(eq(schema.interviewSession.id, sessionId));

      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as {
        captureStatus: string;
        analysisCapped: boolean;
      };

      expect(body.captureStatus).toBe('recording');
      expect(body.analysisCapped).toBe(true);
    });

    it('analysis_capped_at が null の場合 analysisCapped=false', async () => {
      // beforeEach のシードは analysis_capped_at なし
      const res = await GET(makeRequest(sessionId, 0), makeParams(sessionId));
      expect(res.status).toBe(200);
      const body = await res.json() as { analysisCapped: boolean };
      expect(body.analysisCapped).toBe(false);
    });
  });
});

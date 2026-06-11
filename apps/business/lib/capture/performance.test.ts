/**
 * 性能テスト — realtime-interview-capture (task 8.3)
 *
 * P-1: 60分分負荷（~700 セグメント）下での live-state クエリ性能（Req 8.1）
 *      - cursor=0 全量クエリ、cursor=350 差分クエリをそれぞれ計測
 *      - ローカル Docker Postgres でのアサート上限: < 1000ms
 *
 * P-2: ポーリング関数実行量の算術検証（R-5）
 *      - 2.5s インターバル × 60min = 1440 req/session
 *
 * P-3: 内部遅延予算（Req 2.1, 3.3）
 *      - transcript.data POST → セグメント永続化の処理時間（mocked externals）
 *      - セグメント → segmenter tick → ターン確定の処理時間（mocked externals）
 *      - 外部 STT/LLM は本番 Stage 1 実測値が別途必要（注記参照）
 *
 * 計測値は console.info で出力し、.kiro/specs/realtime-interview-capture/research.md
 * の「8.3 E2E・性能 実測」セクションに記録する。
 *
 * Requirements: 2.1, 3.3, 8.1, R-5
 * Design: Performance / Testing Strategy / LiveStateAPI
 */

// `server-only` は Next.js ビルド時専用パッケージ。vitest Node 環境では空モックに置換する。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const {
  PERF_USER_ID,
  mockRequireUserPerf,
  mockAnalyzeTurnPerf,
  mockSplitInterviewerCandidatePerf,
  mockAggregatePatternCoveragePerf,
  mockProposeNextQuestionsPerf,
  mockGenerateSessionReportPerf,
  mockUploadToBlobPerf,
  mockCreateBotPerf,
  mockLeaveBotPerf,
  mockGetRecordingDownloadUrlPerf,
} = vi.hoisted(() => {
  const mockRequireUserPerf = vi.fn<() => Promise<{ id: string; email: string }>>();
  return {
    PERF_USER_ID: 'perf-test-user-fixed-id-8-3',
    mockRequireUserPerf,
    mockAnalyzeTurnPerf: vi.fn(),
    mockSplitInterviewerCandidatePerf: vi.fn(),
    mockAggregatePatternCoveragePerf: vi.fn(),
    mockProposeNextQuestionsPerf: vi.fn(),
    mockGenerateSessionReportPerf: vi.fn(),
    mockUploadToBlobPerf: vi.fn(),
    mockCreateBotPerf: vi.fn(),
    mockLeaveBotPerf: vi.fn(),
    mockGetRecordingDownloadUrlPerf: vi.fn(),
  };
});

/**
 * @bulr/auth/server のモック（performance.test.ts 版）。
 * P-1 の live-state GET の requireUser + requireSessionOwnership を通過させる。
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function authedAction(schema: any, handler: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (rawInput: unknown): Promise<any> => {
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false as const, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
      }
      try {
        const data = await handler(parsed.data, { userId: PERF_USER_ID, email: 'perf@example.com' });
        return { ok: true as const, data };
      } catch (e) {
        if (e instanceof AuthError) {
          return { ok: false as const, error: { code: e.code, message: e.message } };
        }
        throw e;
      }
    };
  }

  return {
    AuthError,
    requireSessionOwnership,
    authedAction,
    requireUser: mockRequireUserPerf,
  };
});

/** @bulr/ai のモック */
vi.mock('@bulr/ai', () => ({
  createLlmContext: vi.fn(() => ({
    analyzeTurn: mockAnalyzeTurnPerf,
    splitInterviewerCandidate: mockSplitInterviewerCandidatePerf,
    proposeNextQuestions: mockProposeNextQuestionsPerf,
    aggregatePatternCoverage: mockAggregatePatternCoveragePerf,
    generateSessionReport: mockGenerateSessionReportPerf,
  })),
  aggregateHeatmap: vi.fn().mockReturnValue({ heatmap: 'mock-stub' }),
  transcribeAudio: vi.fn(),
}));

/** Recall クライアントのモック */
vi.mock('./recall-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./recall-client')>();
  return {
    ...actual,
    createRecallClient: vi.fn(() => ({
      createBot: mockCreateBotPerf,
      leaveBot: mockLeaveBotPerf,
      getRecordingDownloadUrl: mockGetRecordingDownloadUrlPerf,
    })),
  };
});

/** Blob クライアントのモック */
vi.mock('@/lib/audio/blob-client', () => ({
  uploadToBlob: mockUploadToBlobPerf,
}));

/**
 * fallback-transcription のモック。
 * isTranscriptionUnhealthy は false を返して事後転写パスをスキップする。
 */
vi.mock('./fallback-transcription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fallback-transcription')>();
  return {
    ...actual,
    isTranscriptionUnhealthy: vi.fn().mockReturnValue(false),
    runFallbackTranscription: vi.fn().mockResolvedValue(0),
  };
});

// ---------------------------------------------------------------------------
// Import 群（vi.mock の後に記述する）
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import type { LlmAnalysis, LlmEvaluation } from '@bulr/types/evaluation';

// テスト対象モジュール
import { GET as liveStateGET } from '@/app/api/interview/sessions/[sessionId]/live-state/route';
import { POST as transcriptWebhookPOST } from '@/app/api/webhooks/recall/transcript/route';
import { runSegmenterTick } from './segmenter-tick';
import { createWriteBackConsumer } from './turn-pipeline';
import { issueTranscriptToken } from './recall-webhook-verify';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 60分の面接で期待されるセグメント数（5秒/セグメント × 60min × 60s/min ÷ 5 ≈ 720、設計書準拠で 700） */
const SEGMENT_COUNT = 700;

/** ポーリングインターバル（ms） */
const POLLING_INTERVAL_MS = 2500;

/** セッション継続時間（秒） */
const SESSION_DURATION_SECS = 60 * 60; // 3600s = 60 分

/** 期待ポーリング回数 */
const EXPECTED_POLLING_REQUESTS = (SESSION_DURATION_SECS * 1000) / POLLING_INTERVAL_MS; // 1440

/** live-state クエリのローカル許容上限（ms） */
const MAX_LIVE_STATE_QUERY_MS = 1000;

/** 差分クエリのカーソル位置（700 の中間） */
const CURSOR_MID = Math.floor(SEGMENT_COUNT / 2); // 350

/** 面接官の名前（話者ロール解決に使用） */
const PERF_INTERVIEWER_NAME = '面接官 性能テスト太郎';

/** 候補者の名前 */
const PERF_CANDIDATE_NAME = '候補者 性能テスト花子';

// ---------------------------------------------------------------------------
// LLM モック戻り値
// ---------------------------------------------------------------------------

const PERF_MOCK_ANALYSIS: LlmAnalysis = {
  signals: {
    authenticity: 'observed',
    judgment: 'partial',
    meta_cognition: 'absent',
    ai_literacy: 'absent',
  },
  scope_signal: 3,
  level_reached_estimate: 3,
  pattern_match_confidence: 'inferred_high',
  matched_pattern_id: '', // beforeAll で patternId に差し替える
  stuck_signal: null,
  notes: '性能テスト用モック分析',
};

const PERF_MOCK_EVALUATION: LlmEvaluation = {
  authenticity: 2,
  judgment: 1,
  scope: 3,
  meta_cognition: 1,
  ai_literacy: 1,
  level_reached: 3,
  stuck_type: null,
  notes: '性能テスト用モック評価',
  evaluated_at: new Date().toISOString(),
};

const PERF_MOCK_PROPOSALS = {
  candidates: [
    { text: '性能テスト深掘り質問1', intent: 'deep_dive' as const },
    { text: '性能テスト深掘り質問2', intent: 'next_pattern' as const },
    { text: '性能テスト深掘り質問3', intent: 'meta_cognition' as const },
  ],
};

// ---------------------------------------------------------------------------
// ヘルパー: live-state GET リクエスト構築
// ---------------------------------------------------------------------------

function makePerfLiveStateRequest(sessionId: string, cursor: number): Request {
  return new Request(
    `https://example.com/api/interview/sessions/${sessionId}/live-state?cursor=${cursor}`,
    { method: 'GET' },
  );
}

function makePerfLiveStateContext(sessionId: string): { params: Promise<{ sessionId: string }> } {
  return { params: Promise.resolve({ sessionId }) };
}

/** transcript webhook リクエストを構築するヘルパー */
function makePerfTranscriptRequest(body: unknown, token: string): Request {
  return new Request(
    `https://example.com/api/webhooks/recall/transcript?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('性能テスト — realtime-interview-capture', () => {
  // =========================================================================
  // P-1: 60分分セグメント負荷 + live-state クエリ性能（Req 8.1）
  //
  // 700 セグメントを DB に直接 bulk insert し、live-state GET の
  // cursor=0 全量クエリと cursor=350 差分クエリの処理時間を計測する。
  //
  // セッションは capture_status='stopped' として tick を無効化し、
  // クエリ処理時間のみを計測する。
  // =========================================================================

  describe('P-1: 700 セグメント負荷 + live-state クエリ性能 (Req 8.1)', () => {
    let loadSessionId: string;
    let loadPatternId: string;
    let loadPatternCode: string;
    let fullQueryMs: number;
    let diffQueryMs: number;

    beforeAll(async () => {
      if (!process.env['DATABASE_URL']) return;

      loadSessionId = crypto.randomUUID();
      loadPatternId = crypto.randomUUID();
      loadPatternCode = `PERF-LOAD-${loadPatternId.slice(0, 6)}`;

      vi.stubEnv('RECALL_WEBHOOK_SECRET', 'whsec_dGVzdC1rZXktZm9yLXBlcmZvcm1hbmNlLXRlc3Q=');
      vi.stubEnv('BUSINESS_BASE_URL', 'https://perf-test.bulr.example.com');
      vi.stubEnv('CAPTURE_TRANSCRIPT_PROVIDER', 'deepgram_streaming');

      // requireUser モック（live-state GET の認証通過用）
      mockRequireUserPerf.mockResolvedValue({ id: PERF_USER_ID, email: 'perf@example.com' });

      // user（面接官）
      await db.insert(schema.user).values({
        id: PERF_USER_ID,
        email: `perf-load-${PERF_USER_ID}@example.com`,
        emailVerified: false,
        name: PERF_INTERVIEWER_NAME,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // assessment_pattern
      await db.insert(schema.assessmentPattern).values({
        id: loadPatternId,
        code: loadPatternCode,
        category: 'design',
        title: '性能テスト用パターン',
        description: '性能テスト用パターンの説明',
        expected_scope_min: 2,
        expected_scope_max: 4,
        level_1_intro: 'Level 1 説明',
        level_2_focus: 'Level 2 焦点',
        level_3_focus: 'Level 3 焦点',
        level_4_focus: 'Level 4 焦点',
        signals: ['シグナル1', 'シグナル2'],
        ai_perspective: 'AI 観点',
      });

      // interview_session（capture_status='stopped' → tick 不発、純粋クエリ計測）
      // started_at = epoch(0) + 3600 秒前: 60 分経過を再現
      const startedAt = new Date(Date.now() - SESSION_DURATION_SECS * 1000);
      await db.insert(schema.interviewSession).values({
        id: loadSessionId,
        interviewer_id: PERF_USER_ID,
        status: 'completed',
        role: 'backend',
        planned_pattern_codes: [loadPatternCode],
        capture_status: 'stopped',
        started_at: startedAt,
      });

      // 700 セグメントを一括 INSERT（直接 DB 操作で webhook overhead を除去）
      //
      // 設計: 5 秒/セグメント × 700 = 3500 秒 ≈ 58.3 分（60 分面接の実データ規模を再現）
      // 話者は交互（interviewer: 奇数 seq, candidate: 偶数 seq）
      const segments: Array<{
        session_id: string;
        seq: number;
        source_id: string;
        speaker_role: 'interviewer' | 'candidate';
        speaker_label: string;
        text: string;
        started_at_ms: number;
        ended_at_ms: number;
        origin: 'bot_realtime';
      }> = [];

      for (let i = 1; i <= SEGMENT_COUNT; i++) {
        const role: 'interviewer' | 'candidate' = i % 2 === 1 ? 'interviewer' : 'candidate';
        const label = role === 'interviewer' ? PERF_INTERVIEWER_NAME : PERF_CANDIDATE_NAME;
        const startMs = (i - 1) * 5000;
        const endMs = i * 5000 - 500;
        segments.push({
          session_id: loadSessionId,
          seq: i,
          source_id: `perf-bot:${(i - 1) * 5.0}`,
          speaker_role: role,
          speaker_label: label,
          text: `性能テスト発話テキスト ${i}: 分散システム設計における${role === 'interviewer' ? '質問' : '回答'}`,
          started_at_ms: startMs,
          ended_at_ms: endMs,
          origin: 'bot_realtime',
        });
      }

      // バッチサイズ 100 で分割 INSERT（パラメータ上限への安全マージン確保）
      const BATCH_SIZE = 100;
      for (let offset = 0; offset < segments.length; offset += BATCH_SIZE) {
        await db
          .insert(schema.transcriptSegment)
          .values(segments.slice(offset, offset + BATCH_SIZE));
      }
    });

    afterAll(async () => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();

      if (!process.env['DATABASE_URL']) return;

      await db.delete(schema.transcriptSegment).where(eq(schema.transcriptSegment.session_id, loadSessionId));
      await db.delete(schema.sessionReport).where(eq(schema.sessionReport.session_id, loadSessionId));
      await db.delete(schema.captureRecording).where(eq(schema.captureRecording.session_id, loadSessionId));
      await db.delete(schema.patternCoverage).where(eq(schema.patternCoverage.session_id, loadSessionId));
      await db.delete(schema.interviewTurn).where(eq(schema.interviewTurn.session_id, loadSessionId));
      await db.delete(schema.questionProposal).where(eq(schema.questionProposal.session_id, loadSessionId));
      await db.delete(schema.interviewSession).where(eq(schema.interviewSession.id, loadSessionId));
      await db.delete(schema.user).where(eq(schema.user.id, PERF_USER_ID));
      await db.delete(schema.assessmentPattern).where(eq(schema.assessmentPattern.id, loadPatternId));
    });

    it(
      `cursor=0 全量 ${SEGMENT_COUNT} セグメントのクエリが ${MAX_LIVE_STATE_QUERY_MS}ms 未満で完了する`,
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[P-1 full] DATABASE_URL 未設定、スキップ');
          return;
        }

        const t0 = performance.now();
        const res = await liveStateGET(
          makePerfLiveStateRequest(loadSessionId, 0),
          makePerfLiveStateContext(loadSessionId),
        );
        fullQueryMs = performance.now() - t0;

        expect(res.status).toBe(200);

        const body = await res.json() as {
          segments: Array<{ seq: number }>;
          nextCursor: number;
        };

        // 全 700 セグメントが返っていること
        expect(body.segments.length).toBe(SEGMENT_COUNT);
        expect(body.nextCursor).toBe(SEGMENT_COUNT);

        // ローカル Docker Postgres での性能アサート
        expect(fullQueryMs).toBeLessThan(MAX_LIVE_STATE_QUERY_MS);

        console.info(
          `[P-1 full cursor=0] ${SEGMENT_COUNT} segments: ${fullQueryMs.toFixed(1)}ms ` +
          `(上限 ${MAX_LIVE_STATE_QUERY_MS}ms)`,
        );
      },
    );

    it(
      `cursor=${CURSOR_MID} 差分 ${SEGMENT_COUNT - CURSOR_MID} セグメントのクエリが ${MAX_LIVE_STATE_QUERY_MS}ms 未満で完了する`,
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[P-1 diff] DATABASE_URL 未設定、スキップ');
          return;
        }

        const t0 = performance.now();
        const res = await liveStateGET(
          makePerfLiveStateRequest(loadSessionId, CURSOR_MID),
          makePerfLiveStateContext(loadSessionId),
        );
        diffQueryMs = performance.now() - t0;

        expect(res.status).toBe(200);

        const body = await res.json() as {
          segments: Array<{ seq: number }>;
          nextCursor: number;
        };

        // seq > 350 のセグメントのみが返ること（SEGMENT_COUNT - CURSOR_MID = 350）
        const expectedDiffCount = SEGMENT_COUNT - CURSOR_MID;
        expect(body.segments.length).toBe(expectedDiffCount);
        expect(body.segments.every((s) => s.seq > CURSOR_MID)).toBe(true);
        expect(body.nextCursor).toBe(SEGMENT_COUNT);

        // ローカル Docker Postgres での性能アサート
        expect(diffQueryMs).toBeLessThan(MAX_LIVE_STATE_QUERY_MS);

        console.info(
          `[P-1 diff cursor=${CURSOR_MID}] ${expectedDiffCount} segments: ${diffQueryMs.toFixed(1)}ms ` +
          `(上限 ${MAX_LIVE_STATE_QUERY_MS}ms)`,
        );
      },
    );
  });

  // =========================================================================
  // P-2: ポーリング関数実行量の算術検証（R-5）
  //
  // 設計書 R-5 の数値: 2.5s インターバル × 60min = 1440 req/session
  // この計算が DB 不要の純粋算術テストで確認できること。
  // =========================================================================

  describe('P-2: ポーリング関数実行量の算術検証 (R-5)', () => {
    it(
      `2.5s インターバル × ${SESSION_DURATION_SECS / 60}min = ${EXPECTED_POLLING_REQUESTS} req/session（算術確認）`,
      () => {
        // 2500ms インターバル × 3600s = 2.5req/5s × 720 × 5s = 1440 req
        const sessionDurationMs = SESSION_DURATION_SECS * 1000; // 3,600,000ms
        const requestsPerSession = sessionDurationMs / POLLING_INTERVAL_MS;

        expect(POLLING_INTERVAL_MS).toBe(2500); // 2.5s インターバル
        expect(SESSION_DURATION_SECS).toBe(3600); // 60 分
        expect(requestsPerSession).toBe(EXPECTED_POLLING_REQUESTS); // 1440

        console.info(
          `[P-2 ポーリング量] ${POLLING_INTERVAL_MS}ms インターバル × ` +
          `${SESSION_DURATION_SECS / 60}min = ` +
          `${requestsPerSession} req/session`,
        );
      },
    );
  });

  // =========================================================================
  // P-3: 内部遅延予算（Req 2.1, 3.3）
  //
  // mocked externals（LLM・Recall API・Blob）の環境で
  // 内部処理（DB I/O + ビジネスロジック）のレイテンシを計測する。
  //
  // 注記:
  //   外部 STT（Deepgram）のレイテンシおよび LLM 推論レイテンシは、
  //   本番 Stage 1 環境での実測が別途必要（R-5 備考欄を参照）。
  //   本テストは「Recall → DB 保存」「DB → ターン確定」の
  //   内部処理コストのみを記録する。
  // =========================================================================

  describe('P-3: 内部遅延予算 (Req 2.1, 3.3)', () => {
    let delaySessionId: string;
    let delayPatternId: string;
    let delayPatternCode: string;
    let delayBotId: string;
    let delayToken: string;

    beforeEach(async () => {
      if (!process.env['DATABASE_URL']) return;

      delaySessionId = crypto.randomUUID();
      delayPatternId = crypto.randomUUID();
      delayPatternCode = `PERF-DELAY-${delayPatternId.slice(0, 6)}`;
      delayBotId = `perf-delay-bot-${crypto.randomUUID()}`;

      // vi.stubEnv は issueTranscriptToken より先に呼ぶ（RECALL_WEBHOOK_SECRET が必要）
      vi.stubEnv('RECALL_WEBHOOK_SECRET', 'whsec_dGVzdC1rZXktZm9yLXBlcmZvcm1hbmNlLXRlc3Q=');
      vi.stubEnv('BUSINESS_BASE_URL', 'https://perf-test.bulr.example.com');
      vi.stubEnv('CAPTURE_TRANSCRIPT_PROVIDER', 'deepgram_streaming');

      delayToken = issueTranscriptToken({ sessionId: delaySessionId });

      mockRequireUserPerf.mockResolvedValue({ id: PERF_USER_ID, email: 'perf@example.com' });

      const perfAnalysis: LlmAnalysis = {
        ...PERF_MOCK_ANALYSIS,
        matched_pattern_id: delayPatternId,
      };
      mockAnalyzeTurnPerf.mockResolvedValue(perfAnalysis);
      mockSplitInterviewerCandidatePerf.mockResolvedValue({
        interviewer_text: '面接官テキスト（分離済み）',
        candidate_text: '候補者テキスト（分離済み）',
      });
      mockAggregatePatternCoveragePerf.mockResolvedValue(PERF_MOCK_EVALUATION);
      mockProposeNextQuestionsPerf.mockResolvedValue(PERF_MOCK_PROPOSALS);
      mockGenerateSessionReportPerf.mockResolvedValue({ summary_text: '性能テスト面接レポート' });

      // user（面接官）
      await db.insert(schema.user).values({
        id: PERF_USER_ID,
        email: `perf-delay-${PERF_USER_ID}@example.com`,
        emailVerified: false,
        name: PERF_INTERVIEWER_NAME,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // assessment_pattern
      await db.insert(schema.assessmentPattern).values({
        id: delayPatternId,
        code: delayPatternCode,
        category: 'design',
        title: '遅延テスト用パターン',
        description: '遅延テスト用パターンの説明',
        expected_scope_min: 2,
        expected_scope_max: 4,
        level_1_intro: 'Level 1 説明',
        level_2_focus: 'Level 2 焦点',
        level_3_focus: 'Level 3 焦点',
        level_4_focus: 'Level 4 焦点',
        signals: ['シグナル1'],
        ai_perspective: 'AI 観点',
      });

      // interview_session（capture_status='recording', bot_id 設定, started_at=epoch）
      await db.insert(schema.interviewSession).values({
        id: delaySessionId,
        interviewer_id: PERF_USER_ID,
        status: 'in_progress',
        role: 'backend',
        planned_pattern_codes: [delayPatternCode],
        capture_status: 'recording',
        bot_id: delayBotId,
        capture_provider: 'recall',
        started_at: new Date(0), // epoch: start_time 秒 → ms 変換を単純化
        last_capture_event_at: new Date(Date.now() - 1000), // 1 秒前（stale でない）
      });
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();

      if (!process.env['DATABASE_URL']) return;

      await db.delete(schema.transcriptSegment).where(eq(schema.transcriptSegment.session_id, delaySessionId));
      await db.delete(schema.sessionReport).where(eq(schema.sessionReport.session_id, delaySessionId));
      await db.delete(schema.captureRecording).where(eq(schema.captureRecording.session_id, delaySessionId));
      await db.delete(schema.patternCoverage).where(eq(schema.patternCoverage.session_id, delaySessionId));
      await db.delete(schema.interviewTurn).where(eq(schema.interviewTurn.session_id, delaySessionId));
      await db.delete(schema.questionProposal).where(eq(schema.questionProposal.session_id, delaySessionId));
      await db.delete(schema.interviewSession).where(eq(schema.interviewSession.id, delaySessionId));
      await db.delete(schema.user).where(eq(schema.user.id, PERF_USER_ID));
      await db.delete(schema.assessmentPattern).where(eq(schema.assessmentPattern.id, delayPatternId));
      await db.execute(sql`DELETE FROM rate_limit WHERE key = ${'llm:' + delaySessionId}`);
    });

    it(
      'transcript.data POST → セグメント永続化の内部処理レイテンシ計測（mocked externals）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[P-3 webhook] DATABASE_URL 未設定、スキップ');
          return;
        }

        const payload = {
          event: 'transcript.data',
          data: {
            bot_id: delayBotId,
            transcript: {
              text: '遅延予算テスト: 分散システムの設計において最も重要なのは一貫性です。',
              participant: { id: 'p-001', name: PERF_CANDIDATE_NAME },
              is_final: true,
              start_time: 10.0, // 10s → started_at_ms = 10000ms (started_at=epoch)
              end_time: 15.0,
            },
          },
        };

        const t0 = performance.now();
        const res = await transcriptWebhookPOST(
          makePerfTranscriptRequest(payload, delayToken),
        );
        const webhookLatencyMs = performance.now() - t0;

        expect(res.status).toBe(200);

        // セグメントが永続化されていること
        const savedSeg = await db.query.transcriptSegment.findFirst({
          where: eq(schema.transcriptSegment.session_id, delaySessionId),
        });
        expect(savedSeg).not.toBeNull();
        expect(savedSeg?.speaker_role).toBe('candidate');
        expect(savedSeg?.started_at_ms).toBe(10000); // start_time=10.0s × 1000 - epoch(0)

        console.info(
          `[P-3 webhook レイテンシ] transcript.data POST → セグメント永続化: ` +
          `${webhookLatencyMs.toFixed(1)}ms ` +
          `（外部 STT/Deepgram のレイテンシは本番 Stage 1 実測値が別途必要）`,
        );
      },
    );

    it(
      'セグメント受信後の segmenter tick → ターン確定の内部処理レイテンシ計測（mocked externals）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[P-3 tick] DATABASE_URL 未設定、スキップ');
          return;
        }

        // 事前にセグメントを 2 件挿入（Q1: 面接官 + A1: 候補者）
        const q1Payload = {
          event: 'transcript.data',
          data: {
            bot_id: delayBotId,
            transcript: {
              text: '設計における最も重要な観点を教えてください。',
              participant: { id: 'p-interviewer', name: PERF_INTERVIEWER_NAME },
              is_final: true,
              start_time: 0.0,
              end_time: 5.0,
            },
          },
        };
        const a1Payload = {
          event: 'transcript.data',
          data: {
            bot_id: delayBotId,
            transcript: {
              text: '一貫性とパフォーマンスのトレードオフを常に意識しています。CAP定理に基づいてシステム特性を整理します。',
              participant: { id: 'p-candidate', name: PERF_CANDIDATE_NAME },
              is_final: true,
              start_time: 6.0,
              end_time: 20.0,
            },
          },
        };

        await transcriptWebhookPOST(makePerfTranscriptRequest(q1Payload, delayToken));
        await transcriptWebhookPOST(makePerfTranscriptRequest(a1Payload, delayToken));

        // 沈黙時計として now を A1 終了から 10 秒後に設定（silenceGap=4000ms を超過）
        const tickNow = Date.now() + 10_000;

        const t0 = performance.now();
        await runSegmenterTick({
          sessionId: delaySessionId,
          now: tickNow,
          consumer: createWriteBackConsumer(delaySessionId),
        });
        const tickLatencyMs = performance.now() - t0;

        // ターンが生成されていること
        const turns = await db.query.interviewTurn.findMany({
          where: eq(schema.interviewTurn.session_id, delaySessionId),
        });
        expect(turns.length).toBeGreaterThanOrEqual(1);

        // 質問候補が生成されていること（mocked LLM）
        const proposals = await db.query.questionProposal.findMany({
          where: eq(schema.questionProposal.session_id, delaySessionId),
        });
        expect(proposals.length).toBeGreaterThanOrEqual(1);

        console.info(
          `[P-3 tick レイテンシ] セグメント受信後 segmenterTick + writeBackConsumer: ` +
          `${tickLatencyMs.toFixed(1)}ms ` +
          `（ターン確定 + LLM 分析 + 提案生成、LLM は mocked）` +
          `\n  ※ 本番での LLM 推論レイテンシは Stage 1 実測が別途必要`,
        );
      },
    );
  });
});

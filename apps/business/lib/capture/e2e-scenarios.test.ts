/**
 * E2E シナリオ統合テスト — realtime-interview-capture (task 8.3)
 *
 * 実際の DB・ルートハンドラ・サーバーアクション・パイプラインをすべて実コードで動かし、
 * 外部 (LLM・Recall API・Blob) のみモックする。
 * UI コンポーネントの jsdom テストは 5.1–5.4 で実施済み。ここではデータ/制御フローを検証する。
 *
 * シナリオ:
 * 1. オンラインハッピーパス: URL入力 → ボット参加表示 → ライブ転写 →
 *                         候補自動更新 → 終了 → レポート + 全文閲覧
 * 2. 参加失敗 → 対面切替
 * 3. リロード復元: cursor=0 で全状態を一括復元（Req 8.2）
 * 4. 同意なし開始拒否（Req 1.6）
 *
 * Requirements: 1.6, 2.1, 3.3, 5.3, 5.4, 8.1, 8.2
 * Design: Testing Strategy E2E/UI Tests + System Flows
 */

// `server-only` は Next.js ビルド時専用パッケージ。vitest Node 環境では空モックに置換する。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const {
  TEST_USER_ID,
  mockRequireUser,
  mockCreateBot,
  mockLeaveBot,
  mockGetRecordingDownloadUrl,
  mockAnalyzeTurn,
  mockSplitInterviewerCandidate,
  mockAggregatePatternCoverage,
  mockProposeNextQuestions,
  mockGenerateSessionReport,
  mockUploadToBlob,
} = vi.hoisted(() => {
  const mockRequireUser = vi.fn<() => Promise<{ id: string; email: string }>>();
  const mockLeaveBot = vi.fn();
  const mockGetRecordingDownloadUrl = vi.fn();
  return {
    TEST_USER_ID: 'e2e-test-user-fixed-id-8-3',
    mockRequireUser,
    mockCreateBot: vi.fn(),
    mockLeaveBot,
    mockGetRecordingDownloadUrl,
    mockAnalyzeTurn: vi.fn(),
    mockSplitInterviewerCandidate: vi.fn(),
    mockAggregatePatternCoverage: vi.fn(),
    mockProposeNextQuestions: vi.fn(),
    mockGenerateSessionReport: vi.fn(),
    mockUploadToBlob: vi.fn(),
  };
});

/**
 * @bulr/auth/server のモック。
 * - authedAction: 固定 TEST_USER_ID で passthrough（Cookie 不要）
 * - requireUser: mockRequireUser で制御（live-state GET 用）
 * - requireSessionOwnership: 所有権チェックの実互換実装
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
        const data = await handler(parsed.data, { userId: TEST_USER_ID, email: 'test@example.com' });
        return { ok: true as const, data };
      } catch (e) {
        if (e instanceof AuthError) {
          return { ok: false as const, error: { code: e.code, message: e.message } };
        }
        throw e;
      }
    };
  }

  return { AuthError, requireSessionOwnership, authedAction, requireUser: mockRequireUser };
});

/**
 * @bulr/ai のモック。
 * createLlmContext は決定論的コンテキスト（mock 関数束縛）を返す。
 * aggregateHeatmap は決定論的関数のスタブ。
 * transcribeAudio はフォールバック転写で呼ばれる可能性があるが、
 * isTranscriptionUnhealthy をモックして呼ばれないようにする。
 */
vi.mock('@bulr/ai', () => ({
  createLlmContext: vi.fn(() => ({
    analyzeTurn: mockAnalyzeTurn,
    splitInterviewerCandidate: mockSplitInterviewerCandidate,
    proposeNextQuestions: mockProposeNextQuestions,
    aggregatePatternCoverage: mockAggregatePatternCoverage,
    generateSessionReport: mockGenerateSessionReport,
  })),
  aggregateHeatmap: vi.fn().mockReturnValue({ heatmap: 'mock-stub' }),
  transcribeAudio: vi.fn(),
}));

/**
 * Recall クライアントのモック。
 * meetingUrlSchema は実際のエクスポートをそのまま使用する（URL バリデーション検証に必要）。
 */
vi.mock('./recall-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./recall-client')>();
  return {
    ...actual,
    createRecallClient: vi.fn(() => ({
      createBot: mockCreateBot,
      leaveBot: mockLeaveBot,
      getRecordingDownloadUrl: mockGetRecordingDownloadUrl,
    })),
  };
});

/** Blob クライアントのモック。uploadToBlob の戻り値は { audioKey, audioExpiresAt } 形式。 */
vi.mock('@/lib/audio/blob-client', () => ({
  uploadToBlob: mockUploadToBlob,
}));

/**
 * fallback-transcription のモック。
 * isTranscriptionUnhealthy は false を返して事後転写パスをスキップする。
 * runFallbackTranscription は呼ばれないが念のためスタブ化する。
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { asc, count, eq, sql } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import type { LlmAnalysis, LlmEvaluation } from '@bulr/types/evaluation';

// テスト対象モジュール
import { startCapture } from '@/app/(interviewer)/interviews/[sessionId]/_actions/start-capture';
import { stopCapture } from '@/app/(interviewer)/interviews/[sessionId]/_actions/stop-capture';
import { finalizeSession } from './finalize-session';
import { runSegmenterTick } from './segmenter-tick';
import { createWriteBackConsumer } from './turn-pipeline';
import { issueTranscriptToken } from './recall-webhook-verify';
import { POST as transcriptWebhookPOST } from '@/app/api/webhooks/recall/transcript/route';
import { POST as statusWebhookPOST } from '@/app/api/webhooks/recall/route';
import { GET as liveStateGET } from '@/app/api/interview/sessions/[sessionId]/live-state/route';

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const INTERVIEWER_NAME = '面接官 テスト太郎';
const CANDIDATE_NAME = '候補者 テスト花子';
const TEST_MEETING_URL = 'https://zoom.us/j/9876543210';

// ---------------------------------------------------------------------------
// LLM モック戻り値
// ---------------------------------------------------------------------------

const MOCK_ANALYSIS: LlmAnalysis = {
  signals: {
    authenticity: 'observed',
    judgment: 'observed',
    meta_cognition: 'partial',
    ai_literacy: 'absent',
  },
  scope_signal: 4,
  level_reached_estimate: 4,
  pattern_match_confidence: 'exact',
  matched_pattern_id: '', // beforeEach で testPatternId に差し替える
  stuck_signal: null,
  notes: 'E2E テスト用モック分析',
};

const MOCK_LLM_EVALUATION: LlmEvaluation = {
  authenticity: 2,
  judgment: 2,
  scope: 3,
  meta_cognition: 1,
  ai_literacy: 1,
  level_reached: 4,
  stuck_type: null,
  notes: 'E2E テスト用モック評価',
  evaluated_at: new Date().toISOString(),
};

const MOCK_PROPOSALS = {
  candidates: [
    { text: '深掘り質問1: 具体的な設計判断について教えてください', intent: 'deep_dive' as const },
    { text: '深掘り質問2: 別の観点から教えてください', intent: 'next_pattern' as const },
    { text: '深掘り質問3: 振り返ると何が重要でしたか', intent: 'meta_cognition' as const },
  ],
};

// ---------------------------------------------------------------------------
// ヘルパー関数群
// ---------------------------------------------------------------------------

/** Svix 署名付き status webhook リクエストを構築する */
function makeSvixSignedRequest(
  body: unknown,
  rawKey: Buffer,
): Request {
  const rawBody = JSON.stringify(body);
  const svixId = `msg_${crypto.randomUUID()}`;
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = createHmac('sha256', rawKey).update(signedContent).digest('base64');

  return new Request('https://example.com/api/webhooks/recall', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,${sig}`,
    },
    body: rawBody,
  });
}

/** transcript.data ペイロードを構築するヘルパー */
function makeTranscriptPayload(opts: {
  botId: string;
  participantName: string;
  text: string;
  startTime: number;
  endTime: number;
}): object {
  return {
    event: 'transcript.data',
    data: {
      bot_id: opts.botId,
      transcript: {
        text: opts.text,
        participant: { id: 'participant-test', name: opts.participantName },
        is_final: true,
        start_time: opts.startTime,
        end_time: opts.endTime,
      },
    },
  };
}

/** transcript webhook リクエストを構築するヘルパー */
function makeTranscriptRequest(body: unknown, token: string): Request {
  return new Request(
    `https://example.com/api/webhooks/recall/transcript?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/** live-state GET リクエストを構築するヘルパー */
function makeLiveStateRequest(sessionId: string, cursor?: number): Request {
  const cursorParam = cursor !== undefined ? `?cursor=${cursor}` : '?cursor=0';
  return new Request(
    `https://example.com/api/interview/sessions/${sessionId}/live-state${cursorParam}`,
    { method: 'GET' },
  );
}

/** live-state GET のルートコンテキストを構築するヘルパー */
function makeLiveStateContext(sessionId: string): { params: Promise<{ sessionId: string }> } {
  return { params: Promise.resolve({ sessionId }) };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('E2E シナリオ統合テスト — realtime-interview-capture', () => {
  let sessionId: string;
  let botId: string;
  let testPatternId: string;
  let testPatternCode: string;
  let token: string;
  let svixRawKey: Buffer;

  // -------------------------------------------------------------------------
  // beforeEach: 独立したテストデータを作成
  // -------------------------------------------------------------------------
  beforeEach(async () => {
    if (!process.env['DATABASE_URL']) return;

    // Svix 署名キーの生成と env stub
    svixRawKey = randomBytes(32);
    const svixSecret = `whsec_${svixRawKey.toString('base64')}`;
    vi.stubEnv('RECALL_WEBHOOK_SECRET', svixSecret);
    vi.stubEnv('BUSINESS_BASE_URL', 'https://test.bulr.example.com');
    vi.stubEnv('CAPTURE_TRANSCRIPT_PROVIDER', 'deepgram_streaming');

    sessionId = crypto.randomUUID();
    botId = `bot-e2e-${crypto.randomUUID()}`;
    testPatternId = crypto.randomUUID();
    testPatternCode = `E2E-${testPatternId.slice(0, 8)}`;

    // トランスクリプト webhook トークンを発行
    token = issueTranscriptToken({ sessionId });

    // LLM モック設定（testPatternId をインジェクト）
    const analysis: LlmAnalysis = { ...MOCK_ANALYSIS, matched_pattern_id: testPatternId };
    mockAnalyzeTurn.mockResolvedValue(analysis);
    mockSplitInterviewerCandidate.mockResolvedValue({
      interviewer_text: '分離後面接官テキスト',
      candidate_text: '分離後候補者テキスト',
    });
    mockAggregatePatternCoverage.mockResolvedValue(MOCK_LLM_EVALUATION);
    mockProposeNextQuestions.mockResolvedValue(MOCK_PROPOSALS);
    mockGenerateSessionReport.mockResolvedValue({ summary_text: 'E2E テスト面接レポート要約' });

    // Blob モック（uploadToBlob）
    mockUploadToBlob.mockResolvedValue({
      audioKey: `capture-bot/${sessionId}.webm`,
      audioExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // recall クライアントモック
    mockLeaveBot.mockResolvedValue({ ok: true, value: undefined });
    mockGetRecordingDownloadUrl.mockResolvedValue({
      ok: false,
      error: { code: 'api_error', status: 404 },
    });

    // requireUser モック（live-state GET 用）
    mockRequireUser.mockResolvedValue({ id: TEST_USER_ID, email: 'test@example.com' });

    // user（面接官）— INTERVIEWER_NAME と user.name を一致させて speaker_role=interviewer にする
    await db.insert(schema.user).values({
      id: TEST_USER_ID,
      email: `e2e-test-${TEST_USER_ID}@example.com`,
      emailVerified: false,
      name: INTERVIEWER_NAME,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // assessment_pattern（coverage FK 対象）
    await db.insert(schema.assessmentPattern).values({
      id: testPatternId,
      code: testPatternCode,
      category: 'design',
      title: 'E2E テスト用パターン',
      description: 'E2E テスト用パターンの説明',
      expected_scope_min: 2,
      expected_scope_max: 4,
      level_1_intro: 'Level 1 説明',
      level_2_focus: 'Level 2 焦点',
      level_3_focus: 'Level 3 焦点',
      level_4_focus: 'Level 4 焦点',
      signals: ['シグナル1', 'シグナル2'],
      ai_perspective: 'AI 観点',
    });

    // interview_session（consent_obtained_at = デフォルト now()、capture_status='idle'）
    // started_at = epoch(0): start_time 秒 → started_at_ms ms の変換を直接可能にする
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: TEST_USER_ID,
      status: 'draft',
      role: 'backend',
      planned_pattern_codes: [testPatternCode],
      capture_status: 'idle',
      started_at: new Date(0),
    });
  });

  // -------------------------------------------------------------------------
  // afterEach: FK 制約に従い子テーブルから先に削除
  // -------------------------------------------------------------------------
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();

    if (!process.env['DATABASE_URL']) return;

    // 削除順: transcript_segment → session_report → capture_recording →
    //          pattern_coverage → interview_turn → question_proposal →
    //          interview_session → user → assessment_pattern → rate_limit
    await db.delete(schema.transcriptSegment).where(eq(schema.transcriptSegment.session_id, sessionId));
    await db.delete(schema.sessionReport).where(eq(schema.sessionReport.session_id, sessionId));
    await db.delete(schema.captureRecording).where(eq(schema.captureRecording.session_id, sessionId));
    await db.delete(schema.patternCoverage).where(eq(schema.patternCoverage.session_id, sessionId));
    await db.delete(schema.interviewTurn).where(eq(schema.interviewTurn.session_id, sessionId));
    await db.delete(schema.questionProposal).where(eq(schema.questionProposal.session_id, sessionId));
    await db.delete(schema.interviewSession).where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID));
    await db.delete(schema.assessmentPattern).where(eq(schema.assessmentPattern.id, testPatternId));
    await db.execute(sql`DELETE FROM rate_limit WHERE key = ${'llm:' + sessionId}`);
  });

  // =========================================================================
  // シナリオ 1: オンラインハッピーパス（Req 2.1, 3.3, 5.3, 5.4）
  //
  // URL入力 → ボット参加 → ライブ転写 → 候補自動更新 → 終了 → レポート + 全文閲覧
  // =========================================================================

  describe('シナリオ 1: オンラインハッピーパス', () => {
    it(
      'URL入力 → bot_joining → recording → transcript 転写 → tick でターン確定 → live-state で状態確認 → 終了 → session_report 生成 + 全文トランスクリプト閲覧',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[E2E シナリオ 1] DATABASE_URL 未設定、スキップ');
          return;
        }

        // ------------------------------------------------------------------
        // Step 1: startCapture (recall モード) → capture_status='bot_joining', bot_id 設定
        // ------------------------------------------------------------------
        mockCreateBot.mockResolvedValueOnce({ ok: true, value: { botId } });

        const startResult = await startCapture({
          sessionId,
          mode: { kind: 'recall', meetingUrl: TEST_MEETING_URL },
        });

        // authedAction 二重ラップ: result.ok=true (認証通過) → result.data.ok=true (業務成功)
        expect(startResult.ok).toBe(true);
        const startData = (startResult as { ok: true; data: { ok: boolean; data?: { captureStatus: string; botId?: string } } }).data;
        expect(startData.ok).toBe(true);
        expect(startData.data?.captureStatus).toBe('bot_joining');
        expect(startData.data?.botId).toBe(botId);

        // DB: capture_status='bot_joining', bot_id 設定, status='in_progress'
        const sessionAfterStart = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(sessionAfterStart?.capture_status).toBe('bot_joining');
        expect(sessionAfterStart?.bot_id).toBe(botId);
        expect(sessionAfterStart?.status).toBe('in_progress');

        // ------------------------------------------------------------------
        // Step 2: status webhook bot.in_call_recording → capture_status='recording'
        // ------------------------------------------------------------------
        const statusPayload = {
          event: 'bot.in_call_recording',
          data: { bot: { id: botId, metadata: { session_id: sessionId }, sub_code: null } },
        };
        const statusReq = makeSvixSignedRequest(statusPayload, svixRawKey);
        const statusRes = await statusWebhookPOST(statusReq);
        expect(statusRes.status).toBe(200);

        const sessionAfterRecording = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(sessionAfterRecording?.capture_status).toBe('recording');
        // last_capture_event_at が更新されている（Req 2.5）
        expect(sessionAfterRecording?.last_capture_event_at).not.toBeNull();

        // ------------------------------------------------------------------
        // Step 3: transcript.data を複数投入（Q1 + A1 + Q2 + A2）
        // ------------------------------------------------------------------

        // Q1: 面接官の質問 t=0–5s
        const resQ1 = await transcriptWebhookPOST(makeTranscriptRequest(
          makeTranscriptPayload({
            botId,
            participantName: INTERVIEWER_NAME,
            text: '分散システムの設計において最も大切にしていることを教えてください。',
            startTime: 0.0,
            endTime: 5.0,
          }),
          token,
        ));
        expect(resQ1.status).toBe(200);

        // A1: 候補者の回答 t=6–25s（> 40 字 = minAnswerChars を超える）
        const resA1 = await transcriptWebhookPOST(makeTranscriptRequest(
          makeTranscriptPayload({
            botId,
            participantName: CANDIDATE_NAME,
            text: 'はい、主に一貫性とパフォーマンスのトレードオフを意識しています。CAP定理に基づいてシステム特性を整理し、ユースケースに応じた設計を選択しています。',
            startTime: 6.0,
            endTime: 25.0,
          }),
          token,
        ));
        expect(resA1.status).toBe(200);

        // Q2: 面接官の追加質問 t=35–40s（A1との gap=10s > silenceGap=4s → ターン1が沈黙で確定）
        const resQ2 = await transcriptWebhookPOST(makeTranscriptRequest(
          makeTranscriptPayload({
            botId,
            participantName: INTERVIEWER_NAME,
            text: '具体的な事例を教えていただけますか？',
            startTime: 35.0,
            endTime: 40.0,
          }),
          token,
        ));
        expect(resQ2.status).toBe(200);

        // A2: 候補者の回答 t=41–60s
        const resA2 = await transcriptWebhookPOST(makeTranscriptRequest(
          makeTranscriptPayload({
            botId,
            participantName: CANDIDATE_NAME,
            text: 'Kafkaを活用したメッセージキューシステムで、データの一貫性を保ちながら高スループットを実現しました。インデックス設計の詳細をお話しします。',
            startTime: 41.0,
            endTime: 60.0,
          }),
          token,
        ));
        expect(resA2.status).toBe(200);

        // 4 セグメント挿入確認
        const [segCountRow] = await db
          .select({ c: count() })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(Number(segCountRow?.c)).toBe(4);

        // ------------------------------------------------------------------
        // Step 4: runSegmenterTick（沈黙時計 = now を 10s 先に設定）
        //   → interview_turn + question_proposal が生成される（Req 3.3）
        // ------------------------------------------------------------------
        const tickNow = Date.now() + 10_000;
        await runSegmenterTick({
          sessionId,
          now: tickNow,
          consumer: createWriteBackConsumer(sessionId),
        });

        // interview_turn が生成されていること（Req 3.3, 4.1, 4.4）
        const turns = await db
          .select()
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId))
          .orderBy(asc(schema.interviewTurn.sequence_no));

        expect(turns.length).toBeGreaterThanOrEqual(1);

        // ターン 1: transcript が {interviewer, candidate, raw} 形状（Req 4.4）
        const turn1 = turns[0]!;
        const t1 = turn1.transcript as { interviewer: string; candidate: string; raw: string };
        expect(typeof t1.interviewer).toBe('string');
        expect(typeof t1.candidate).toBe('string');
        expect(typeof t1.raw).toBe('string');
        // audio_key は null（音声は capture_recording が保持）
        expect(turn1.audio_key).toBeNull();

        // question_proposal が生成されていること（Req 3.2）
        const proposals = await db
          .select()
          .from(schema.questionProposal)
          .where(eq(schema.questionProposal.session_id, sessionId));
        expect(proposals.length).toBeGreaterThanOrEqual(1);

        // 3 候補が含まれていること（Req 3.2）
        const prop = proposals[0]!;
        expect(prop.candidate_1_text).toBeTruthy();
        expect(prop.candidate_2_text).toBeTruthy();
        expect(prop.candidate_3_text).toBeTruthy();

        // ------------------------------------------------------------------
        // Step 5: GET live-state（cursor=0）で全状態を確認（Req 2.1, 3.1, 3.2）
        // ------------------------------------------------------------------
        const liveStateRes = await liveStateGET(
          makeLiveStateRequest(sessionId, 0),
          makeLiveStateContext(sessionId),
        );
        expect(liveStateRes.status).toBe(200);

        const liveState = await liveStateRes.json() as {
          captureStatus: string;
          segments: Array<{ seq: number; text: string }>;
          coverage: Array<{ patternCode: string; status: string }>;
          currentProposal: { candidates: [object, object, object] } | null;
          nextCursor: number;
        };

        // セグメントが live-state に含まれていること（Req 2.1）
        expect(liveState.segments.length).toBeGreaterThanOrEqual(1);
        expect(liveState.nextCursor).toBeGreaterThan(0);

        // カバレッジに計画パターンが含まれていること（Req 3.1）
        expect(liveState.coverage.length).toBeGreaterThanOrEqual(1);
        const planCovEntry = liveState.coverage.find((c) => c.patternCode === testPatternCode);
        expect(planCovEntry).toBeDefined();

        // currentProposal が含まれていること（Req 3.2）
        expect(liveState.currentProposal).not.toBeNull();
        expect(liveState.currentProposal?.candidates).toHaveLength(3);

        // ------------------------------------------------------------------
        // Step 6: stopCapture(finish) → capture_status='stopping'（Req 5.1）
        // ------------------------------------------------------------------
        await db
          .update(schema.interviewSession)
          .set({ capture_status: 'recording' })
          .where(eq(schema.interviewSession.id, sessionId));

        const stopResult = await stopCapture({ sessionId, reason: 'finish' });
        expect(stopResult.ok).toBe(true);
        const stopData = (stopResult as { ok: true; data: { ok: boolean; data?: { captureStatus: string } } }).data;
        expect(stopData.ok).toBe(true);
        expect(stopData.data?.captureStatus).toBe('stopping');

        // ------------------------------------------------------------------
        // Step 7: finalizeSession → session_report 生成 + status='completed'（Req 5.3）
        // ------------------------------------------------------------------
        const finalizeResult = await finalizeSession({ sessionId, userId: TEST_USER_ID });
        expect(finalizeResult.ok).toBe(true);

        // session_report が作成されていること（Req 5.3）
        const report = await db.query.sessionReport.findFirst({
          where: eq(schema.sessionReport.session_id, sessionId),
        });
        expect(report).not.toBeNull();
        expect(report?.summary_text).toBe('E2E テスト面接レポート要約');

        // session.status='completed'（Req 5.3）
        const finalSession = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(finalSession?.status).toBe('completed');

        // ------------------------------------------------------------------
        // Step 8: 全文トランスクリプト閲覧（Req 5.4）
        //   transcript_segment クエリで話者ラベル付きセグメントが取得できること
        // ------------------------------------------------------------------
        const allSegments = await db
          .select({
            seq: schema.transcriptSegment.seq,
            speaker_role: schema.transcriptSegment.speaker_role,
            text: schema.transcriptSegment.text,
            logical_turn_id: schema.transcriptSegment.logical_turn_id,
          })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId))
          .orderBy(asc(schema.transcriptSegment.seq));

        expect(allSegments.length).toBe(4);

        // 話者ラベルが正しく設定されていること（Req 2.2）
        const interviewerSegs = allSegments.filter((s) => s.speaker_role === 'interviewer');
        const candidateSegs = allSegments.filter((s) => s.speaker_role === 'candidate');
        expect(interviewerSegs.length).toBe(2);
        expect(candidateSegs.length).toBe(2);

        // claim 済みセグメントが存在すること（論理ターン化済み、Req 4.1）
        const claimedSegs = allSegments.filter((s) => s.logical_turn_id !== null);
        expect(claimedSegs.length).toBeGreaterThan(0);
      },
    );
  });

  // =========================================================================
  // シナリオ 2: 参加失敗 → 対面切替（Req 1.4 → 1.5）
  //
  // createBot が失敗 → capture_status='failed' → startCapture({mic}) → recording
  // =========================================================================

  describe('シナリオ 2: 参加失敗 → 対面切替', () => {
    it(
      'createBot エラー → capture_status=failed + retryable → startCapture mic → capture_status=recording + capture_provider=mic',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[E2E シナリオ 2] DATABASE_URL 未設定、スキップ');
          return;
        }

        // ------------------------------------------------------------------
        // Step 1: startCapture recall → createBot エラー → failed
        // ------------------------------------------------------------------
        mockCreateBot.mockResolvedValueOnce({
          ok: false,
          error: { code: 'api_error', status: 503 },
        });

        const failResult = await startCapture({
          sessionId,
          mode: { kind: 'recall', meetingUrl: TEST_MEETING_URL },
        });

        expect(failResult.ok).toBe(true);
        const failData = (failResult as { ok: true; data: { ok: boolean; error?: { retryable?: boolean; canSwitchToMic?: boolean } } }).data;
        expect(failData.ok).toBe(false);
        // retryable + canSwitchToMic フラグ（Req 1.4）
        expect(failData.error?.retryable).toBe(true);
        expect(failData.error?.canSwitchToMic).toBe(true);

        // DB: capture_status='failed'
        const sessionAfterFail = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(sessionAfterFail?.capture_status).toBe('failed');

        // ------------------------------------------------------------------
        // Step 2: startCapture mic → recording（Req 1.5）
        //   failed → recording: canTransition('failed', 'recording') の確認
        // ------------------------------------------------------------------
        const micResult = await startCapture({
          sessionId,
          mode: { kind: 'mic' },
        });

        expect(micResult.ok).toBe(true);
        const micData = (micResult as { ok: true; data: { ok: boolean; data?: { captureStatus: string } } }).data;
        expect(micData.ok).toBe(true);
        expect(micData.data?.captureStatus).toBe('recording');

        // DB: capture_status='recording', capture_provider='mic'
        const sessionAfterMic = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(sessionAfterMic?.capture_status).toBe('recording');
        expect(sessionAfterMic?.capture_provider).toBe('mic');
        // bot_id は設定されていない（mic モードはボットを使わない）
        expect(sessionAfterMic?.bot_id).toBeNull();
      },
    );
  });

  // =========================================================================
  // シナリオ 3: リロード復元（Req 8.2）
  //
  // 複数セグメントを挿入後、cursor=0 の live-state GET で全量が復元されること。
  // また cursor=N の差分クエリで N より大きい seq のセグメントのみが返ること。
  // =========================================================================

  describe('シナリオ 3: リロード復元（Req 8.2）', () => {
    it(
      'cursor=0 で全セグメント + coverage + proposal を取得（リロード復元）、cursor=N で差分のみ返す',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('[E2E シナリオ 3] DATABASE_URL 未設定、スキップ');
          return;
        }

        // recording 状態にセットアップ
        await db
          .update(schema.interviewSession)
          .set({
            capture_status: 'recording',
            bot_id: botId,
            capture_provider: 'recall',
            status: 'in_progress',
            last_capture_event_at: new Date(Date.now() - 5_000), // 5秒前（stale でない）
          })
          .where(eq(schema.interviewSession.id, sessionId));

        // セグメントを 5 件挿入（seq 1–5）
        const segmentCount = 5;
        for (let i = 1; i <= segmentCount; i++) {
          const role = i % 2 === 1 ? 'interviewer' : 'candidate';
          const participantName = role === 'interviewer' ? INTERVIEWER_NAME : CANDIDATE_NAME;
          await transcriptWebhookPOST(makeTranscriptRequest(
            makeTranscriptPayload({
              botId,
              participantName,
              text: `テスト発話テキスト ${i}（${role}）`,
              startTime: (i - 1) * 5.0,
              endTime: i * 5.0 - 0.5,
            }),
            token,
          ));
        }

        // 5 セグメント挿入されていること
        const [segCount] = await db
          .select({ c: count() })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(Number(segCount?.c)).toBe(segmentCount);

        // question_proposal を挿入（リロード復元で currentProposal が返ることを確認）
        await db.insert(schema.questionProposal).values({
          session_id: sessionId,
          prepared_for_turn_no: 1,
          candidate_1_text: MOCK_PROPOSALS.candidates[0]!.text,
          candidate_1_intent: MOCK_PROPOSALS.candidates[0]!.intent,
          candidate_2_text: MOCK_PROPOSALS.candidates[1]!.text,
          candidate_2_intent: MOCK_PROPOSALS.candidates[1]!.intent,
          candidate_3_text: MOCK_PROPOSALS.candidates[2]!.text,
          candidate_3_intent: MOCK_PROPOSALS.candidates[2]!.intent,
          selected_index: null,
        });

        // ----------------------------------------------------------------
        // cursor=0: 全量取得（リロード復元）
        // ----------------------------------------------------------------
        const fullRes = await liveStateGET(
          makeLiveStateRequest(sessionId, 0),
          makeLiveStateContext(sessionId),
        );
        expect(fullRes.status).toBe(200);

        const fullState = await fullRes.json() as {
          segments: Array<{ seq: number }>;
          currentProposal: object | null;
          coverage: Array<{ patternCode: string }>;
          nextCursor: number;
        };

        // 全 5 セグメントが返っていること（Req 8.2: cursor=0 で全量）
        expect(fullState.segments.length).toBe(segmentCount);
        expect(fullState.nextCursor).toBe(segmentCount);

        // currentProposal が返っていること（Req 8.2: リロード後に候補復元）
        expect(fullState.currentProposal).not.toBeNull();

        // coverage が返っていること（Req 8.2: リロード後にカバレッジ復元）
        expect(fullState.coverage.length).toBeGreaterThanOrEqual(1);

        // ----------------------------------------------------------------
        // cursor=3: 差分のみ取得（seq > 3 = 4, 5）
        // ----------------------------------------------------------------
        const diffRes = await liveStateGET(
          makeLiveStateRequest(sessionId, 3),
          makeLiveStateContext(sessionId),
        );
        expect(diffRes.status).toBe(200);

        const diffState = await diffRes.json() as {
          segments: Array<{ seq: number }>;
          nextCursor: number;
        };

        // seq > 3 のセグメントのみ（4 と 5）
        expect(diffState.segments.length).toBe(2);
        expect(diffState.segments.every((s) => s.seq > 3)).toBe(true);
        expect(diffState.nextCursor).toBe(segmentCount);
      },
    );
  });

  // =========================================================================
  // シナリオ 4: 同意なし開始拒否（Req 1.6）
  //
  // consent_obtained_at = null のセッションで startCapture が CONSENT_REQUIRED を返すこと。
  //
  // 設計上の注記:
  //   interview_session.consent_obtained_at は DB スキーマで notNull/defaultNow のため、
  //   INSERT では null を直接セットできない。そのため capture-actions.test.ts と同じ
  //   「db.query.interviewSession.findFirst を spy して null consent を持つ行を返す」
  //   アプローチで consent ゲートを検証する。
  //   これは task 2.5 のテストと同一パターンであり、スキーマ制約の documented limitation。
  // =========================================================================

  describe('シナリオ 4: 同意なし開始拒否（Req 1.6）', () => {
    it('consent_obtained_at = null のセッションで startCapture が CONSENT_REQUIRED を返し、キャプチャが開始されない', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('[E2E シナリオ 4] DATABASE_URL 未設定、スキップ');
        return;
      }

      // spy: consent_obtained_at = null を持つセッション行を返す
      const sessionWithNullConsent = {
        id: sessionId,
        interviewer_id: TEST_USER_ID,
        consent_obtained_at: null as unknown as Date,
        consent_version: 'ja-v1',
        status: 'draft' as const,
        capture_status: 'idle' as const,
        capture_provider: null,
        bot_id: null,
        meeting_url: null,
        started_at: new Date(0),
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        last_capture_event_at: null,
        analysis_capped_at: null,
        role: 'backend',
        planned_pattern_codes: [testPatternCode],
        entry_id: null,
        candidate_id: null,
        consent_method: null,
        consent_actor_id: null,
      };

      const spy = vi
        .spyOn(db.query.interviewSession, 'findFirst')
        .mockResolvedValueOnce(sessionWithNullConsent);

      // recall モードで開始試行
      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: TEST_MEETING_URL },
      });

      // authedAction 外層は ok:true（認証通過）
      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; error?: { code: string } } }).data;

      // ハンドラが CONSENT_REQUIRED を返すこと（Req 1.6）
      expect(handlerResult.ok).toBe(false);
      expect(handlerResult.error?.code).toBe('CONSENT_REQUIRED');

      // createBot は呼ばれていない（同意チェックが先に拒否した）
      expect(mockCreateBot).not.toHaveBeenCalled();

      // DB: capture_status が idle のまま（キャプチャ未開始）
      const dbSession = await db.query.interviewSession.findFirst({
        where: eq(schema.interviewSession.id, sessionId),
      });
      expect(dbSession?.capture_status).toBe('idle');
      expect(dbSession?.status).toBe('draft');

      spy.mockRestore();
    });
  });
});

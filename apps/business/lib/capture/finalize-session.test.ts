/**
 * finalizeSession 統合テスト（DB バックド、LLM / Recall / Blob モック）
 *
 * 検証観点:
 * (1) flush + report (5.3): 未消費セグメント → ターン生成 + session_report + status='completed'
 * (2) bot recording registered (2.7): capture_recording(kind='bot_full') 登録 + Blob 転送確認
 * (3) leaveBot called (5.1): recall.leaveBot が bot_id で呼ばれる
 * (4) idempotent re-run (5.5): 2 回実行 → 重複ターン・重複 bot_full なし
 * (5) mic session (no bot): leaveBot / bot_full なし、flush + report は実行
 *
 * Requirements: 2.7, 5.1, 5.2, 5.3, 5.5
 * Design: FinalizeExtension（/api/interview/finalize 改修）
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。vitest Node 環境では空モックに置換。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const {
  mockAnalyzeTurn,
  mockSplitInterviewerCandidate,
  mockAggregatePatternCoverage,
  mockGenerateSessionReport,
  mockProposeNextQuestions,
  mockLeaveBot,
  mockGetRecordingDownloadUrl,
  mockCreateRecallClient,
  mockUploadToBlob,
} = vi.hoisted(() => {
  const mockLeaveBot = vi.fn();
  const mockGetRecordingDownloadUrl = vi.fn();
  return {
    mockAnalyzeTurn: vi.fn(),
    mockSplitInterviewerCandidate: vi.fn(),
    mockAggregatePatternCoverage: vi.fn(),
    mockGenerateSessionReport: vi.fn(),
    mockProposeNextQuestions: vi.fn(),
    mockLeaveBot,
    mockGetRecordingDownloadUrl,
    mockCreateRecallClient: vi.fn(() => ({
      leaveBot: mockLeaveBot,
      getRecordingDownloadUrl: mockGetRecordingDownloadUrl,
      createBot: vi.fn(),
    })),
    mockUploadToBlob: vi.fn(),
  };
});

/**
 * @bulr/ai のモック。
 * createLlmContext は mock 関数を束縛した決定論コンテキストを返す。
 * aggregateHeatmap は決定論的関数なのでスタブで代替する。
 */
vi.mock('@bulr/ai', () => ({
  aggregateHeatmap: vi.fn().mockReturnValue({ heatmap: 'stub' }),
  createLlmContext: vi.fn(() => ({
    analyzeTurn: mockAnalyzeTurn,
    splitInterviewerCandidate: mockSplitInterviewerCandidate,
    aggregatePatternCoverage: mockAggregatePatternCoverage,
    generateSessionReport: mockGenerateSessionReport,
    proposeNextQuestions: mockProposeNextQuestions,
  })),
}));

/**
 * Recall クライアントのモック。
 * leaveBot / getRecordingDownloadUrl をモック関数として公開する。
 */
vi.mock('./recall-client', () => ({
  createRecallClient: mockCreateRecallClient,
}));

/**
 * Blob クライアントのモック。
 * uploadToBlob の戻り値は { audioKey, audioExpiresAt } 形式。
 */
vi.mock('@/lib/audio/blob-client', () => ({
  uploadToBlob: mockUploadToBlob,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import type { LlmAnalysis, LlmEvaluation } from '@bulr/types/evaluation';
import { finalizeSession } from './finalize-session';

// ---------------------------------------------------------------------------
// テスト用モック戻り値
// ---------------------------------------------------------------------------

const MOCK_ANALYSIS: LlmAnalysis = {
  signals: {
    authenticity: 'observed',
    judgment: 'partial',
    meta_cognition: 'absent',
    ai_literacy: 'absent',
  },
  scope_signal: 3,
  level_reached_estimate: 2,
  pattern_match_confidence: 'inferred_high',
  matched_pattern_id: null,
  stuck_signal: null,
  notes: 'finalizeテスト用モック分析',
};

const MOCK_LLM_EVALUATION: LlmEvaluation = {
  authenticity: 2,
  judgment: 2,
  scope: 3,
  meta_cognition: 1,
  ai_literacy: 1,
  level_reached: 4,
  stuck_type: null,
  notes: 'finalizeテスト用モック評価',
  evaluated_at: new Date().toISOString(),
};

const MOCK_PROPOSALS = {
  candidates: [
    { text: '次の質問候補1: 詳しく教えてください', intent: 'deep_dive' as const },
    { text: '次の質問候補2: 別の観点から', intent: 'next_pattern' as const },
    { text: '次の質問候補3: 振り返ってみて', intent: 'meta_cognition' as const },
  ],
};

const FAKE_RECORDING_URL = 'https://recordings.example.com/fake-bot-audio.webm';
const FAKE_AUDIO_KEY = 'capture-bot/test-session.webm';
const FAKE_AUDIO_EXPIRES_AT = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('finalizeSession', () => {
  let userId: string;
  let sessionId: string;
  let botId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();
    botId = `bot-${crypto.randomUUID()}`;

    // LLM モックのデフォルト設定
    mockAnalyzeTurn.mockResolvedValue(MOCK_ANALYSIS);
    mockSplitInterviewerCandidate.mockResolvedValue({
      interviewer_text: '質問テキスト',
      candidate_text: '回答テキスト',
    });
    mockAggregatePatternCoverage.mockResolvedValue(MOCK_LLM_EVALUATION);
    mockGenerateSessionReport.mockResolvedValue({ summary_text: 'テスト用サマリー' });
    mockProposeNextQuestions.mockResolvedValue(MOCK_PROPOSALS);

    // Recall クライアントモックのデフォルト設定
    mockLeaveBot.mockResolvedValue({ ok: true, value: undefined });
    mockGetRecordingDownloadUrl.mockResolvedValue({
      ok: true,
      value: { url: FAKE_RECORDING_URL, expiresAt: FAKE_AUDIO_EXPIRES_AT.toISOString() },
    });

    // Blob クライアントモックのデフォルト設定
    mockUploadToBlob.mockResolvedValue({
      audioKey: FAKE_AUDIO_KEY,
      audioExpiresAt: FAKE_AUDIO_EXPIRES_AT,
    });

    // グローバル fetch モック（録音ファイルダウンロード用）
    const fakeAudioBytes = new Uint8Array([0x49, 0x44, 0x33]).buffer; // fake audio bytes
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(fakeAudioBytes),
    }));

    if (!process.env['DATABASE_URL']) return;

    // Better Auth ユーザーを挿入（FK 参照元）
    await db.insert(schema.user).values({
      id: userId,
      email: `finalize-test-${userId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();

    if (!process.env['DATABASE_URL']) return;

    // FK 制約に従い子テーブルから削除
    await db.delete(schema.captureRecording).where(eq(schema.captureRecording.session_id, sessionId));
    await db.delete(schema.transcriptSegment).where(eq(schema.transcriptSegment.session_id, sessionId));
    await db.delete(schema.patternCoverage).where(eq(schema.patternCoverage.session_id, sessionId));
    await db.delete(schema.interviewTurn).where(eq(schema.interviewTurn.session_id, sessionId));
    await db.delete(schema.questionProposal).where(eq(schema.questionProposal.session_id, sessionId));
    await db.delete(schema.sessionReport).where(eq(schema.sessionReport.session_id, sessionId));
    await db.delete(schema.interviewSession).where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  // =========================================================================
  // (1) flush + report (5.3 headline)
  //
  // 未消費セグメント（Q+A ペア）を持つセッションで finalizeSession を呼んだとき、
  // セグメントがフラッシュされて interview_turn が生成され、session_report と
  // status='completed' が確認できること。
  //
  // Requirements: 5.3
  // =========================================================================

  describe('(1) flush + report', () => {
    it(
      '未消費 Q/A セグメント → interview_turn 生成、session_report 存在、status=completed',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        // Session 作成（recall ボット）
        await db.insert(schema.interviewSession).values({
          id: sessionId,
          interviewer_id: userId,
          status: 'in_progress',
          role: 'backend',
          planned_pattern_codes: [],
          capture_status: 'stopped',
          capture_provider: 'recall',
          bot_id: botId,
          started_at: new Date(0), // epoch 0: started_at_ms の相対計算を単純化
        });

        // 未消費セグメント: 面接官の質問 + 候補者の回答
        await db.insert(schema.transcriptSegment).values([
          {
            session_id: sessionId,
            seq: 1,
            source_id: `${botId}:0.0`,
            speaker_role: 'interviewer',
            speaker_label: 'Interviewer',
            text: '分散システム設計において最も重要視していることを教えてください。',
            started_at_ms: 0,
            ended_at_ms: 5000,
            origin: 'bot_realtime',
            logical_turn_id: null,
          },
          {
            session_id: sessionId,
            seq: 2,
            source_id: `${botId}:6.0`,
            speaker_role: 'candidate',
            speaker_label: 'Candidate',
            text: '主に一貫性とパフォーマンスのトレードオフを意識しています。CAP定理に基づいてシステムの特性を整理し、ユースケースに応じて適切な設計を選択しています。',
            started_at_ms: 6000,
            ended_at_ms: 30000,
            origin: 'bot_realtime',
            logical_turn_id: null,
          },
        ]);

        // finalizeSession を呼ぶ
        const result = await finalizeSession({ sessionId, userId });

        expect(result.ok).toBe(true);
        if (!result.ok) return; // type narrowing
        expect(result.redirect).toBe(`/interviews/${sessionId}/report`);

        // interview_turn が 1 件生成されている
        const [turnCountRow] = await db
          .select({ c: count() })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));
        expect(Number(turnCountRow?.c)).toBeGreaterThanOrEqual(1);

        // session_report が存在する
        const report = await db.query.sessionReport.findFirst({
          where: eq(schema.sessionReport.session_id, sessionId),
        });
        expect(report).toBeDefined();
        expect(report?.summary_text).toBe('テスト用サマリー');

        // status が completed になっている
        const session = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(session?.status).toBe('completed');
      },
    );
  });

  // =========================================================================
  // (2) bot recording registered (2.7 observable)
  //
  // capture_provider='recall' セッションで finalizeSession を呼んだとき、
  // capture_recording(kind='bot_full') が登録され、
  // getRecordingDownloadUrl と uploadToBlob が呼ばれること。
  //
  // Requirements: 2.7
  // =========================================================================

  describe('(2) bot recording registered', () => {
    it(
      'capture_recording(kind=bot_full) が登録され、getRecordingDownloadUrl と uploadToBlob が呼ばれる',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        await db.insert(schema.interviewSession).values({
          id: sessionId,
          interviewer_id: userId,
          status: 'in_progress',
          role: 'backend',
          planned_pattern_codes: [],
          capture_status: 'stopped',
          capture_provider: 'recall',
          bot_id: botId,
          started_at: new Date(),
        });

        const result = await finalizeSession({ sessionId, userId });
        expect(result.ok).toBe(true);

        // capture_recording(kind='bot_full') が 1 件存在する
        const recording = await db.query.captureRecording.findFirst({
          where: and(
            eq(schema.captureRecording.session_id, sessionId),
            eq(schema.captureRecording.kind, 'bot_full'),
          ),
        });
        expect(recording).toBeDefined();
        expect(recording?.audio_key).toBe(FAKE_AUDIO_KEY);
        // audio_expires_at が now + 約 30 日であること
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        expect(recording?.audio_expires_at.getTime()).toBeGreaterThan(now + thirtyDaysMs - 60_000);
        expect(recording?.audio_expires_at.getTime()).toBeLessThan(now + thirtyDaysMs + 60_000);
        expect(recording?.chunk_no).toBeNull();

        // Recall クライアントの getRecordingDownloadUrl が呼ばれた
        expect(mockGetRecordingDownloadUrl).toHaveBeenCalledWith(botId);

        // uploadToBlob が呼ばれた
        expect(mockUploadToBlob).toHaveBeenCalledWith(
          expect.any(Blob),
          `capture-bot/${sessionId}.webm`,
        );
      },
    );
  });

  // =========================================================================
  // (3) leaveBot called (5.1 observable)
  //
  // capture_provider='recall' かつ bot_id があるセッションで finalizeSession を呼んだとき、
  // recall.leaveBot が bot_id で呼ばれること。
  //
  // Requirements: 5.1
  // =========================================================================

  describe('(3) leaveBot called', () => {
    it(
      'recall.leaveBot が bot_id で呼ばれる',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        await db.insert(schema.interviewSession).values({
          id: sessionId,
          interviewer_id: userId,
          status: 'in_progress',
          role: 'backend',
          planned_pattern_codes: [],
          capture_status: 'stopped',
          capture_provider: 'recall',
          bot_id: botId,
          started_at: new Date(),
        });

        await finalizeSession({ sessionId, userId });

        expect(mockLeaveBot).toHaveBeenCalledWith(botId);
      },
    );
  });

  // =========================================================================
  // (4) idempotent re-run (5.5 observable)
  //
  // finalizeSession を 2 回実行しても:
  // - interview_turn が重複しない（fingerprint 一意制約）
  // - capture_recording(kind='bot_full') が重複しない（idempotency guard）
  // - session_report が 1 件のまま（upsert）
  // - status が 'completed' のまま
  //
  // Requirements: 5.5
  // =========================================================================

  describe('(4) idempotent re-run', () => {
    it(
      'finalizeSession を 2 回実行しても重複ターン・重複 bot_full・重複レポートが生じない',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        await db.insert(schema.interviewSession).values({
          id: sessionId,
          interviewer_id: userId,
          status: 'in_progress',
          role: 'backend',
          planned_pattern_codes: [],
          capture_status: 'stopped',
          capture_provider: 'recall',
          bot_id: botId,
          started_at: new Date(0),
        });

        // 未消費セグメント（Q+A ペア）
        await db.insert(schema.transcriptSegment).values([
          {
            session_id: sessionId,
            seq: 1,
            source_id: `${botId}:idem:0.0`,
            speaker_role: 'interviewer',
            speaker_label: 'Interviewer',
            text: '冪等性テスト用の質問です。詳しく教えてください。',
            started_at_ms: 0,
            ended_at_ms: 5000,
            origin: 'bot_realtime',
            logical_turn_id: null,
          },
          {
            session_id: sessionId,
            seq: 2,
            source_id: `${botId}:idem:6.0`,
            speaker_role: 'candidate',
            speaker_label: 'Candidate',
            text: '冪等性テスト用の回答です。主に一貫性とパフォーマンスのトレードオフを意識しています。これが私の考え方です。',
            started_at_ms: 6000,
            ended_at_ms: 30000,
            origin: 'bot_realtime',
            logical_turn_id: null,
          },
        ]);

        // 1 回目の実行
        const result1 = await finalizeSession({ sessionId, userId });
        expect(result1.ok).toBe(true);

        // 1 回目後の状態を記録
        const [turnCountRow1] = await db
          .select({ c: count() })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));
        const turnCount1 = Number(turnCountRow1?.c);

        const [botFullCount1Row] = await db
          .select({ c: count() })
          .from(schema.captureRecording)
          .where(and(
            eq(schema.captureRecording.session_id, sessionId),
            eq(schema.captureRecording.kind, 'bot_full'),
          ));
        const botFullCount1 = Number(botFullCount1Row?.c);

        const [reportCountRow1] = await db
          .select({ c: count() })
          .from(schema.sessionReport)
          .where(eq(schema.sessionReport.session_id, sessionId));
        const reportCount1 = Number(reportCountRow1?.c);

        // 2 回目の実行（モックをリセットせず再利用）
        const result2 = await finalizeSession({ sessionId, userId });
        expect(result2.ok).toBe(true);

        // interview_turn 数は変わらない（フラッシュ済みセグメントは再処理されない）
        const [turnCountRow2] = await db
          .select({ c: count() })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));
        expect(Number(turnCountRow2?.c)).toBe(turnCount1);

        // capture_recording(kind='bot_full') は増えない（idempotency guard）
        const [botFullCount2Row] = await db
          .select({ c: count() })
          .from(schema.captureRecording)
          .where(and(
            eq(schema.captureRecording.session_id, sessionId),
            eq(schema.captureRecording.kind, 'bot_full'),
          ));
        expect(Number(botFullCount2Row?.c)).toBe(botFullCount1);
        expect(botFullCount1).toBe(1); // 初回は 1 件

        // session_report は 1 件のまま（upsert）
        const [reportCountRow2] = await db
          .select({ c: count() })
          .from(schema.sessionReport)
          .where(eq(schema.sessionReport.session_id, sessionId));
        expect(Number(reportCountRow2?.c)).toBe(reportCount1);
        expect(reportCount1).toBe(1);

        // status は 'completed' のまま
        const session = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(session?.status).toBe('completed');
      },
    );
  });

  // =========================================================================
  // (5) mic session (no bot)
  //
  // capture_provider='mic' かつ bot_id なし のセッションで finalizeSession を呼んだとき、
  // - leaveBot は呼ばれない
  // - capture_recording(kind='bot_full') は登録されない
  // - flush + report は実行される（session_report が存在し、status='completed'）
  //
  // Requirements: 5.1, 2.7, 5.3
  // =========================================================================

  describe('(5) mic session (no bot)', () => {
    it(
      'leaveBot / bot_full なし、flush + report は実行される',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        // マイク録音セッション（bot_id なし）
        await db.insert(schema.interviewSession).values({
          id: sessionId,
          interviewer_id: userId,
          status: 'in_progress',
          role: 'backend',
          planned_pattern_codes: [],
          capture_status: 'stopped',
          capture_provider: 'mic',
          bot_id: null, // ボットなし
          started_at: new Date(0),
        });

        // 未消費セグメント: unknown-only（対面モード）
        await db.insert(schema.transcriptSegment).values([
          {
            session_id: sessionId,
            seq: 1,
            source_id: `mic:0`,
            speaker_role: 'unknown',
            speaker_label: null,
            text: '対面モード: 最初の発話テキストです。',
            started_at_ms: 0,
            ended_at_ms: 5000,
            origin: 'mic_chunk',
            logical_turn_id: null,
          },
          {
            session_id: sessionId,
            seq: 2,
            source_id: `mic:6`,
            speaker_role: 'unknown',
            speaker_label: null,
            text: '対面モード: 二番目の発話テキストです。これは候補者の回答で、長い内容を含んでいます。',
            started_at_ms: 6000,
            ended_at_ms: 30000,
            origin: 'mic_chunk',
            logical_turn_id: null,
          },
        ]);

        const result = await finalizeSession({ sessionId, userId });
        expect(result.ok).toBe(true);

        // leaveBot は呼ばれない
        expect(mockLeaveBot).not.toHaveBeenCalled();

        // capture_recording(kind='bot_full') は登録されない
        const botFullRecording = await db.query.captureRecording.findFirst({
          where: and(
            eq(schema.captureRecording.session_id, sessionId),
            eq(schema.captureRecording.kind, 'bot_full'),
          ),
        });
        expect(botFullRecording).toBeUndefined();

        // getRecordingDownloadUrl も呼ばれない
        expect(mockGetRecordingDownloadUrl).not.toHaveBeenCalled();

        // session_report は存在する（レポート生成は実行される）
        const report = await db.query.sessionReport.findFirst({
          where: eq(schema.sessionReport.session_id, sessionId),
        });
        expect(report).toBeDefined();

        // status は completed
        const session = await db.query.interviewSession.findFirst({
          where: eq(schema.interviewSession.id, sessionId),
        });
        expect(session?.status).toBe('completed');
      },
    );
  });
});

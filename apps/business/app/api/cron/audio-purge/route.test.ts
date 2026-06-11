/**
 * GET /api/cron/audio-purge 統合テスト（DB バックド、deleteBlob モック）
 *
 * 検証観点 (7.3, 7.4):
 * (1) 期限切れ capture_recording の audio_key が null 化され、deleteBlob が呼ばれる
 * (2) 未期限切れ capture_recording は変更されない
 * (3) transcript_segment / interview_turn は cron 実行後も削除されない（7.4）
 * (4) 認証: 不正 Bearer → 401、何も削除されない
 * (5) 冪等性: 2 回実行でエラーなし、2 回目の recordingsDeleted=0
 * (6) 既存 interview_turn の期限切れ音声削除が継続動作する
 *
 * Requirements: 7.3, 7.4
 * Design: RetentionExtension（audio-purge cron 改修）
 *
 * CRON_SECRET: vi.stubEnv で TEST_CRON_SECRET に上書き。.env.local の CRON_SECRET が
 * 空文字のため、テスト用の既知シークレットを毎回 stub する。
 */

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: deleteBlob スパイを vi.mock ファクトリ内から参照できるよう先に評価
// ---------------------------------------------------------------------------

const { mockDeleteBlob } = vi.hoisted(() => ({
  // vitest v4.x: vi.fn() without explicit type args — avoids the deprecated 2-arg generic form
  mockDeleteBlob: vi.fn().mockImplementation(() => Promise.resolve()),
}));

/**
 * Vercel Blob の deleteBlob をスパイに差し替える。
 * テスト内で実際の Blob 削除を発生させない。
 */
vi.mock('@/lib/audio/blob-client', () => ({
  deleteBlob: mockDeleteBlob,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import type { LlmAnalysis } from '@bulr/types/evaluation';
import { GET } from './route';

// テスト用 CRON_SECRET（vi.stubEnv で上書き）
const TEST_CRON_SECRET = 'test-cron-secret-audio-purge-7c9a2f';

/** GET リクエストを組み立てるヘルパー */
function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/audio-purge', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

/** テスト用の最小 LlmAnalysis（interview_turn シーディング用） */
const MOCK_LLM_ANALYSIS: LlmAnalysis = {
  signals: {
    authenticity: 'observed',
    judgment: 'partial',
    meta_cognition: 'absent',
    ai_literacy: 'observed',
  },
  scope_signal: 3,
  level_reached_estimate: 2,
  pattern_match_confidence: 'inferred_high',
  matched_pattern_id: null,
  stuck_signal: null,
  notes: 'audio-purge テスト用',
};

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('GET /api/cron/audio-purge', () => {
  let userId: string;
  let sessionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();

    // CRON_SECRET を既知の値に stub
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
    mockDeleteBlob.mockImplementation(() => Promise.resolve());

    if (!process.env['DATABASE_URL']) return;

    // Better Auth ユーザーを挿入（interview_session の FK 参照元）
    await db.insert(schema.user).values({
      id: userId,
      email: `audio-purge-test-${userId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();

    if (!process.env['DATABASE_URL']) return;

    // FK 制約に従い子テーブルから順に削除
    await db
      .delete(schema.captureRecording)
      .where(eq(schema.captureRecording.session_id, sessionId));
    await db
      .delete(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    await db
      .delete(schema.patternCoverage)
      .where(eq(schema.patternCoverage.session_id, sessionId));
    await db
      .delete(schema.interviewTurn)
      .where(eq(schema.interviewTurn.session_id, sessionId));
    await db
      .delete(schema.questionProposal)
      .where(eq(schema.questionProposal.session_id, sessionId));
    await db
      .delete(schema.sessionReport)
      .where(eq(schema.sessionReport.session_id, sessionId));
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  // =========================================================================
  // 認証（DB 不要）
  // =========================================================================

  describe('認証', () => {
    it('Authorization ヘッダーなし → 401、deleteBlob 未呼び出し', async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
      expect(mockDeleteBlob).not.toHaveBeenCalled();
    });

    it('不正な Bearer トークン → 401、deleteBlob 未呼び出し', async () => {
      const res = await GET(makeRequest('Bearer wrong-secret'));
      expect(res.status).toBe(401);
      expect(mockDeleteBlob).not.toHaveBeenCalled();
    });

    it('正しい Bearer トークン → 200', async () => {
      const res = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // (1) 期限切れ capture_recording の purge（7.3 headline）
  //
  // 期限切れ capture_recording（audio_key NOT NULL AND audio_expires_at <= now()）:
  //   deleteBlob が audio_key で呼ばれ、audio_key が null になる
  // 未期限切れ capture_recording:
  //   deleteBlob は呼ばれず、audio_key はそのまま
  //
  // Requirements: 7.3
  // =========================================================================

  describe('(1) 期限切れ capture_recording の purge', () => {
    it(
      '期限切れ capture_recording の audio_key が null 化され deleteBlob が呼ばれる；未期限切れは変更されない',
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
        });

        const expiredKey = `audio/expired-rec-${crypto.randomUUID()}.webm`;
        const futureKey = `audio/future-rec-${crypto.randomUUID()}.webm`;

        // 期限切れの capture_recording（1 秒前に期限切れ）
        const [expiredRec] = await db
          .insert(schema.captureRecording)
          .values({
            session_id: sessionId,
            kind: 'mic_chunk',
            chunk_no: 1,
            audio_key: expiredKey,
            audio_expires_at: new Date(Date.now() - 1_000),
          })
          .returning({ id: schema.captureRecording.id });

        // 未期限切れの capture_recording（30 日後）
        const [futureRec] = await db
          .insert(schema.captureRecording)
          .values({
            session_id: sessionId,
            kind: 'bot_full',
            audio_key: futureKey,
            audio_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
          })
          .returning({ id: schema.captureRecording.id });

        const res = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`));
        const body = (await res.json()) as {
          recordingsDeleted: number;
          recordingsFailed: number;
          deleted: number;
          failed: number;
        };

        expect(res.status).toBe(200);
        // capture_recording 削除カウント
        expect(body.recordingsDeleted).toBe(1);
        expect(body.recordingsFailed).toBe(0);
        // interview_turn は 0 件（副作用なし）
        expect(body.deleted).toBe(0);
        expect(body.failed).toBe(0);

        // deleteBlob が期限切れキーで呼ばれた
        expect(mockDeleteBlob).toHaveBeenCalledWith(expiredKey);
        // deleteBlob が未期限切れキーで呼ばれていない
        const blobCallArgs = mockDeleteBlob.mock.calls.map((c) => c[0]);
        expect(blobCallArgs).not.toContain(futureKey);

        // 期限切れ行: audio_key が null になっている（行は残存）
        const expiredAfter = await db.query.captureRecording.findFirst({
          where: eq(schema.captureRecording.id, expiredRec!.id),
        });
        expect(expiredAfter).toBeDefined();
        expect(expiredAfter?.audio_key).toBeNull();

        // 未期限切れ行: audio_key はそのまま
        const futureAfter = await db.query.captureRecording.findFirst({
          where: eq(schema.captureRecording.id, futureRec!.id),
        });
        expect(futureAfter?.audio_key).toBe(futureKey);
      },
    );
  });

  // =========================================================================
  // (2) transcript_segment / interview_turn は削除されない（7.4 headline）
  //
  // 期限切れ capture_recording を持つセッションで cron を実行しても、
  // transcript_segment と interview_turn は存在し続けること。
  //
  // Requirements: 7.4
  // =========================================================================

  describe('(2) transcript_segment / interview_turn は削除されない (7.4)', () => {
    it(
      'cron 実行後も transcript_segment と interview_turn がそれぞれ 1 件残る',
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
        });

        // transcript_segment を 1 件 insert
        await db.insert(schema.transcriptSegment).values({
          session_id: sessionId,
          seq: 1,
          source_id: `seg-src-${crypto.randomUUID()}`,
          speaker_role: 'interviewer',
          text: 'テスト質問テキスト',
          started_at_ms: 0,
          ended_at_ms: 5_000,
          origin: 'bot_realtime',
        });

        // interview_turn を 1 件 insert（audio_key なし）
        await db.insert(schema.interviewTurn).values({
          session_id: sessionId,
          sequence_no: 1,
          question_source: 'manual',
          question_text: 'テスト質問',
          transcript: { candidate: '回答テキスト', raw: 'テスト' },
          llm_analysis: MOCK_LLM_ANALYSIS,
          pattern_match_confidence: 'inferred_high',
          duration_ms: 5_000,
        });

        // 期限切れ capture_recording（purge 対象）
        await db.insert(schema.captureRecording).values({
          session_id: sessionId,
          kind: 'mic_chunk',
          audio_key: `audio/purge-target-${crypto.randomUUID()}.webm`,
          audio_expires_at: new Date(Date.now() - 1_000),
        });

        const res = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`));
        expect(res.status).toBe(200);

        // transcript_segment は残っている
        const [segCountRow] = await db
          .select({ c: count() })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(Number(segCountRow?.c)).toBe(1);

        // interview_turn は残っている
        const [turnCountRow] = await db
          .select({ c: count() })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));
        expect(Number(turnCountRow?.c)).toBe(1);
      },
    );
  });

  // =========================================================================
  // (3) 冪等性: 2 回実行
  //
  // 1 回目で audio_key が null になり、2 回目は対象行が audio_key IS NOT NULL
  // フィルターで除外されるため recordingsDeleted=0 かつエラーなし。
  //
  // Requirements: 7.3
  // =========================================================================

  describe('(3) 冪等性', () => {
    it(
      '2 回実行してもエラーなし、2 回目は recordingsDeleted=0',
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
        });

        await db.insert(schema.captureRecording).values({
          session_id: sessionId,
          kind: 'mic_chunk',
          audio_key: `audio/idempotent-${crypto.randomUUID()}.webm`,
          audio_expires_at: new Date(Date.now() - 1_000),
        });

        // 1 回目
        const res1 = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`));
        const body1 = (await res1.json()) as { recordingsDeleted: number };
        expect(res1.status).toBe(200);
        expect(body1.recordingsDeleted).toBe(1);

        // 2 回目: audio_key が既に null なので対象なし
        const res2 = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`));
        const body2 = (await res2.json()) as { recordingsDeleted: number };
        expect(res2.status).toBe(200);
        expect(body2.recordingsDeleted).toBe(0);
      },
    );
  });

  // =========================================================================
  // (4) 既存 interview_turn purge の継続動作
  //
  // 期限切れ interview_turn.audio_key は従来どおり null 化され、
  // deleted カウントに計上されること。
  //
  // Requirements: 7.3（既存動作の維持）
  // =========================================================================

  describe('(4) 既存 interview_turn purge の継続動作', () => {
    it(
      '期限切れ interview_turn.audio_key が null 化され deleted=1',
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
        });

        const turnAudioKey = `audio/turn-expired-${crypto.randomUUID()}.webm`;
        const [turnRow] = await db
          .insert(schema.interviewTurn)
          .values({
            session_id: sessionId,
            sequence_no: 1,
            question_source: 'manual',
            question_text: 'テスト質問',
            transcript: { candidate: '回答', raw: 'テスト' },
            llm_analysis: MOCK_LLM_ANALYSIS,
            pattern_match_confidence: 'inferred_high',
            duration_ms: 5_000,
            audio_key: turnAudioKey,
            audio_expires_at: new Date(Date.now() - 1_000), // 期限切れ
          })
          .returning({ id: schema.interviewTurn.id });

        const res = await GET(makeRequest(`Bearer ${TEST_CRON_SECRET}`));
        const body = (await res.json()) as {
          deleted: number;
          failed: number;
          recordingsDeleted: number;
          recordingsFailed: number;
        };

        expect(res.status).toBe(200);
        expect(body.deleted).toBe(1);
        expect(body.failed).toBe(0);
        expect(body.recordingsDeleted).toBe(0);
        expect(mockDeleteBlob).toHaveBeenCalledWith(turnAudioKey);

        // audio_key が null になっている
        const turnAfter = await db.query.interviewTurn.findFirst({
          where: eq(schema.interviewTurn.id, turnRow!.id),
        });
        expect(turnAfter?.audio_key).toBeNull();
      },
    );
  });
});

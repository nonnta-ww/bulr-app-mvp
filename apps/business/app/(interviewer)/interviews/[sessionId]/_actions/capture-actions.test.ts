/**
 * startCapture / stopCapture Server Action の統合テスト（DB バックド）。
 *
 * - `@bulr/auth/server` の authedAction を passthrough モックに置換（Cookie 不要）
 * - recall-client は完全モック（ネットワーク呼び出しなし）
 * - session 状態の検証は実際の Docker Postgres に対して行う
 * - consent_obtained_at が null のケースのみ DB.query.findFirst を spy してテスト
 *
 * Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 5.1, 7.1, 7.5, 7.6
 * Design: CaptureOrchestrator (Service Interface, Responsibilities & Constraints)
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
const { TEST_USER_ID, mockCreateBot, mockLeaveBot } = vi.hoisted(() => ({
  TEST_USER_ID: 'capture-action-test-user-fixed-id',
  mockCreateBot: vi.fn(),
  mockLeaveBot: vi.fn(),
}));

/**
 * @bulr/auth/server のモック。
 * authedAction を固定 userId passthrough に差し替える。
 * requireSessionOwnership と AuthError は実装を再現した互換実装を提供する。
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
      // safeParse: バリデーション失敗は throw せず { ok:false } を返す
      // （実際の authedAction と同じ境界動作）
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          ok: false as const,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        };
      }
      try {
        const data = await handler(parsed.data, {
          userId: TEST_USER_ID,
          email: 'test@example.com',
        });
        return { ok: true as const, data };
      } catch (e) {
        if (e instanceof AuthError) {
          return { ok: false as const, error: { code: e.code, message: e.message } };
        }
        throw e;
      }
    };
  }

  return { AuthError, requireSessionOwnership, authedAction };
});

/**
 * recall-client のモック。
 * createBot / leaveBot を vi.fn() で制御する。
 * meetingUrlSchema は実際のエクスポートをそのまま使用する（Fix 2 の検証に必要）。
 */
vi.mock('../../../../../lib/capture/recall-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/capture/recall-client')>();
  return {
    ...actual,
    createRecallClient: () => ({
      createBot: mockCreateBot,
      leaveBot: mockLeaveBot,
    }),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { startCapture } from './start-capture';
import { stopCapture } from './stop-capture';

// ---------------------------------------------------------------------------
// DB ヘルパー
// ---------------------------------------------------------------------------

/** interview_session の capture 関連カラムを読み取る */
async function readSession(id: string) {
  return db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, id),
  });
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('startCapture / stopCapture Server Actions', () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = crypto.randomUUID();

    vi.stubEnv('RECALL_WEBHOOK_SECRET', 'whsec_dGVzdC1zZWNyZXQtZm9yLWNhcHR1cmUtYWN0aW9ucw==');
    vi.stubEnv('BUSINESS_BASE_URL', 'https://test.example.com');
    vi.stubEnv('CAPTURE_TRANSCRIPT_PROVIDER', 'deepgram_streaming');

    // Better Auth ユーザーを挿入（interview_session.interviewer_id FK）
    await db.insert(schema.user).values({
      id: TEST_USER_ID,
      email: `test-${TEST_USER_ID}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // セッションを idle 状態で作成（consent_obtained_at は DB デフォルト = now()）
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: TEST_USER_ID,
      status: 'draft',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'idle',
    });

    // leaveBot はデフォルトで成功を返す
    mockLeaveBot.mockResolvedValue({ ok: true, value: undefined });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockCreateBot.mockReset();
    mockLeaveBot.mockReset();

    // FK 制約に従い session → user の順で削除
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID));
  });

  // -----------------------------------------------------------------------
  // 1. 同意未記録セッションで開始が拒否される（Req 1.6, 7.5）
  // -----------------------------------------------------------------------
  describe('同意ゲート', () => {
    it('consent_obtained_at が null のセッションでキャプチャ開始を拒否する', async () => {
      // DB.query を spy して consent_obtained_at = null のセッションを返す
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
        started_at: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        last_capture_event_at: null,
        analysis_capped_at: null,
        role: 'backend',
        planned_pattern_codes: [],
        entry_id: null,
        candidate_id: null,
      };

      const spy = vi
        .spyOn(db.query.interviewSession, 'findFirst')
        .mockResolvedValueOnce(sessionWithNullConsent);

      const result = await startCapture({
        sessionId,
        mode: { kind: 'mic' },
      });

      // authedAction の外層は ok:true（認証は通過）
      // ハンドラーが ok:false を返すので data.ok が false
      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; error?: { code: string } } }).data;
      expect(handlerResult.ok).toBe(false);
      expect(handlerResult.error?.code).toBe('CONSENT_REQUIRED');

      // createBot は呼ばれていない
      expect(mockCreateBot).not.toHaveBeenCalled();

      // DB の session が変更されていない（capture_status は idle のまま）
      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('idle');
      expect(dbSession?.status).toBe('draft');

      spy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 2. recall モード: startCapture 成功（Req 1.1, 1.3, 2.4, 1.7）
  // -----------------------------------------------------------------------
  describe('recall モード startCapture 成功', () => {
    it('createBot 成功後に bot_id / capture_status / status / started_at が DB に設定される', async () => {
      const BOT_ID = `bot-${crypto.randomUUID()}`;
      mockCreateBot.mockResolvedValueOnce({ ok: true, value: { botId: BOT_ID } });

      const meetingUrl = 'https://zoom.us/j/1234567890';
      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl },
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; data?: { captureStatus: string; botId?: string } } }).data;
      expect(handlerResult.ok).toBe(true);
      expect(handlerResult.data?.captureStatus).toBe('bot_joining');
      expect(handlerResult.data?.botId).toBe(BOT_ID);

      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('bot_joining');
      expect(dbSession?.capture_provider).toBe('recall');
      expect(dbSession?.bot_id).toBe(BOT_ID);
      expect(dbSession?.status).toBe('in_progress');
      expect(dbSession?.started_at).not.toBeNull();
    });

    it('createBot は webhookBaseUrl にトランスクリプトトークン + transcriptProvider + sessionId metadata を含む引数で呼ばれる', async () => {
      const BOT_ID = `bot-${crypto.randomUUID()}`;
      mockCreateBot.mockResolvedValueOnce({ ok: true, value: { botId: BOT_ID } });

      await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: 'https://zoom.us/j/1234567890' },
      });

      expect(mockCreateBot).toHaveBeenCalledOnce();
      const createBotArgs = mockCreateBot.mock.calls[0]![0] as {
        meetingUrl: string;
        botName: string;
        transcriptProvider: string;
        webhookBaseUrl: string;
        metadata: { sessionId: string };
      };

      // webhookBaseUrl に token クエリパラメータが含まれる
      expect(createBotArgs.webhookBaseUrl).toContain('/api/webhooks/recall/transcript');
      expect(createBotArgs.webhookBaseUrl).toContain('token=');
      // token に sessionId が含まれる（issueTranscriptToken の仕様）
      const url = new URL(createBotArgs.webhookBaseUrl);
      const token = url.searchParams.get('token');
      expect(token).toContain(sessionId);

      // transcriptProvider
      expect(createBotArgs.transcriptProvider).toBe('deepgram_streaming');

      // metadata.sessionId
      expect(createBotArgs.metadata.sessionId).toBe(sessionId);
    });
  });

  // -----------------------------------------------------------------------
  // 3. recall モード: createBot エラー → bot_joining 経由で failed へ（Req 1.4）
  //
  // Fix 1 (state-machine fidelity): createBot 失敗時も idle → bot_joining → failed の
  // 遷移グラフに沿う。DB に bot_joining を先行書き込みするため、失敗後の DB 状態には
  // bot_joining 訪問の証跡（capture_provider='recall', status='in_progress', started_at 非null）
  // が残り、最終的に capture_status='failed' で終わる。
  // -----------------------------------------------------------------------
  describe('recall モード: createBot エラー', () => {
    it('createBot が invalid_meeting_url を返した場合 bot_joining を経由して capture_status が failed になり retryable/canSwitchToMic が設定される', async () => {
      mockCreateBot.mockResolvedValueOnce({
        ok: false,
        error: { code: 'invalid_meeting_url' },
      });

      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: 'https://zoom.us/j/1234567890' },
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; error?: { code: string; retryable?: boolean; canSwitchToMic?: boolean } } }).data;
      expect(handlerResult.ok).toBe(false);
      expect(handlerResult.error?.code).toBe('invalid_meeting_url');
      expect(handlerResult.error?.retryable).toBe(true);
      expect(handlerResult.error?.canSwitchToMic).toBe(true);

      // capture_status = 'failed' になっている（最終状態）
      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('failed');

      // bot_joining を経由した証跡: capture_provider と status / started_at が設定済み
      // （idle → bot_joining の先行書き込みが行われてから createBot が呼ばれる）
      expect(dbSession?.capture_provider).toBe('recall');
      expect(dbSession?.status).toBe('in_progress');
      expect(dbSession?.started_at).not.toBeNull();

      // consent カラムは変わっていない（Req 7.5）
      expect(dbSession?.consent_obtained_at).not.toBeNull();
      expect(dbSession?.consent_version).toBe('ja-v1');
    });

    it('createBot が api_error を返した場合も bot_joining 経由で capture_status が failed になり retryable が設定される', async () => {
      mockCreateBot.mockResolvedValueOnce({
        ok: false,
        error: { code: 'api_error', status: 503 },
      });

      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: 'https://zoom.us/j/1234567890' },
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; error?: { retryable?: boolean; canSwitchToMic?: boolean } } }).data;
      expect(handlerResult.ok).toBe(false);
      expect(handlerResult.error?.retryable).toBe(true);
      expect(handlerResult.error?.canSwitchToMic).toBe(true);

      // 最終状態 = failed、かつ bot_joining 訪問の証跡が残っている
      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('failed');
      expect(dbSession?.capture_provider).toBe('recall');
      expect(dbSession?.status).toBe('in_progress');
      expect(dbSession?.started_at).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 3b. recall モード: 無効な meetingUrl → バリデーションエラー（Fix 2, Req 1.2, 7.2）
  //
  // 入力スキーマ境界（Zod）で meetingUrl フォーマット検証が行われるため、
  // createBot は呼ばれず DB 書き込みも発生しない。
  // -----------------------------------------------------------------------
  describe('recall モード: meetingUrl バリデーション（Fix 2）', () => {
    it('Zoom/Meet/Teams に該当しない URL は Zod バリデーションエラーで拒否され createBot も DB 書き込みも発生しない', async () => {
      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: 'https://example.com/not-a-meeting' },
      });

      // authedAction の Zod parse が失敗するため ok:false が返る
      expect(result.ok).toBe(false);

      // createBot は呼ばれていない
      expect(mockCreateBot).not.toHaveBeenCalled();

      // DB の session が変更されていない（capture_status は idle のまま）
      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('idle');
      expect(dbSession?.capture_provider).toBeNull();
      expect(dbSession?.status).toBe('draft');
    });

    it('空文字列の meetingUrl も Zod バリデーションで拒否される', async () => {
      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: '' },
      });

      expect(result.ok).toBe(false);
      expect(mockCreateBot).not.toHaveBeenCalled();

      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('idle');
    });

    it('有効な Google Meet URL は Zod バリデーションを通過して createBot が呼ばれる', async () => {
      const BOT_ID = `bot-meet-${crypto.randomUUID()}`;
      mockCreateBot.mockResolvedValueOnce({ ok: true, value: { botId: BOT_ID } });

      const result = await startCapture({
        sessionId,
        mode: { kind: 'recall', meetingUrl: 'https://meet.google.com/abc-defg-hij' },
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean } }).data;
      expect(handlerResult.ok).toBe(true);
      expect(mockCreateBot).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // 4. mic モード: startCapture 成功（Req 1.5, 1.7）
  // -----------------------------------------------------------------------
  describe('mic モード startCapture 成功', () => {
    it('capture_status="recording" / capture_provider="mic" / status="in_progress" が DB に設定される', async () => {
      const result = await startCapture({
        sessionId,
        mode: { kind: 'mic' },
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; data?: { captureStatus: string } } }).data;
      expect(handlerResult.ok).toBe(true);
      expect(handlerResult.data?.captureStatus).toBe('recording');

      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('recording');
      expect(dbSession?.capture_provider).toBe('mic');
      expect(dbSession?.status).toBe('in_progress');
      expect(dbSession?.started_at).not.toBeNull();

      // createBot は呼ばれていない
      expect(mockCreateBot).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. stopCapture abort → capture_status='aborted' / leaveBot 呼び出し（Req 7.6）
  // -----------------------------------------------------------------------
  describe('stopCapture abort', () => {
    it('bot_id が存在する recording セッションを abort すると capture_status が aborted になり leaveBot が呼ばれる', async () => {
      const BOT_ID = `bot-stop-test-${crypto.randomUUID()}`;

      // 先に recording 状態にする（bot_id も設定）
      await db
        .update(schema.interviewSession)
        .set({
          capture_status: 'recording',
          capture_provider: 'recall',
          bot_id: BOT_ID,
          status: 'in_progress',
          started_at: new Date(),
        })
        .where(eq(schema.interviewSession.id, sessionId));

      const result = await stopCapture({
        sessionId,
        reason: 'abort',
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; data?: { captureStatus: string } } }).data;
      expect(handlerResult.ok).toBe(true);
      expect(handlerResult.data?.captureStatus).toBe('aborted');

      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('aborted');

      // leaveBot が bot_id で呼ばれている
      expect(mockLeaveBot).toHaveBeenCalledOnce();
      expect(mockLeaveBot).toHaveBeenCalledWith(BOT_ID);
    });

    it('bot_id が null（mic モード）の場合は leaveBot を呼ばずに aborted にする', async () => {
      // mic モードで recording 状態
      await db
        .update(schema.interviewSession)
        .set({
          capture_status: 'recording',
          capture_provider: 'mic',
          bot_id: null,
          status: 'in_progress',
          started_at: new Date(),
        })
        .where(eq(schema.interviewSession.id, sessionId));

      const result = await stopCapture({
        sessionId,
        reason: 'abort',
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; data?: { captureStatus: string } } }).data;
      expect(handlerResult.ok).toBe(true);
      expect(handlerResult.data?.captureStatus).toBe('aborted');

      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('aborted');

      // leaveBot は呼ばれていない
      expect(mockLeaveBot).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 6. stopCapture finish → capture_status='stopping'（Req 5.1）
  // -----------------------------------------------------------------------
  describe('stopCapture finish', () => {
    it('recording セッションを finish すると capture_status が stopping になる', async () => {
      const BOT_ID = `bot-finish-test-${crypto.randomUUID()}`;

      await db
        .update(schema.interviewSession)
        .set({
          capture_status: 'recording',
          capture_provider: 'recall',
          bot_id: BOT_ID,
          status: 'in_progress',
          started_at: new Date(),
        })
        .where(eq(schema.interviewSession.id, sessionId));

      const result = await stopCapture({
        sessionId,
        reason: 'finish',
      });

      expect(result.ok).toBe(true);
      const handlerResult = (result as { ok: true; data: { ok: boolean; data?: { captureStatus: string } } }).data;
      expect(handlerResult.ok).toBe(true);
      expect(handlerResult.data?.captureStatus).toBe('stopping');

      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('stopping');

      // leaveBot も best-effort 呼び出しされる
      expect(mockLeaveBot).toHaveBeenCalledOnce();
      expect(mockLeaveBot).toHaveBeenCalledWith(BOT_ID);
    });
  });

  // -----------------------------------------------------------------------
  // 7. 所有権チェック（Req 7.1）
  // -----------------------------------------------------------------------
  describe('所有権チェック', () => {
    // 別ユーザー ID（セッション所有者として設定する）
    let anotherUserId: string;

    beforeEach(async () => {
      anotherUserId = crypto.randomUUID();
      // 別ユーザーを DB に挿入（FK 用）
      await db.insert(schema.user).values({
        id: anotherUserId,
        email: `another-${anotherUserId}@example.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    afterEach(async () => {
      // FK 制約解除のため、先にセッションの interviewer_id を TEST_USER_ID に戻してから
      // anotherUserId ユーザーを削除する（外側の afterEach が session を削除するため）。
      await db
        .update(schema.interviewSession)
        .set({ interviewer_id: TEST_USER_ID })
        .where(eq(schema.interviewSession.id, sessionId));
      await db.delete(schema.user).where(eq(schema.user.id, anotherUserId));
    });

    it('異なる userId からの呼び出しは FORBIDDEN で拒否される', async () => {
      // セッションの所有者を別ユーザーに変更
      await db
        .update(schema.interviewSession)
        .set({ interviewer_id: anotherUserId })
        .where(eq(schema.interviewSession.id, sessionId));

      // TEST_USER_ID（authedAction で固定）と anotherUserId は違うので FORBIDDEN になるはず
      const result = await startCapture({
        sessionId,
        mode: { kind: 'mic' },
      });

      // AuthError('FORBIDDEN') が throw → authedAction 外層で捕捉 → ok:false
      expect(result.ok).toBe(false);
      const errorResult = result as { ok: false; error: { code: string } };
      expect(errorResult.error.code).toBe('FORBIDDEN');

      // DB は変わっていない（capture_status は idle のまま）
      const dbSession = await readSession(sessionId);
      expect(dbSession?.capture_status).toBe('idle');
    });
  });
});

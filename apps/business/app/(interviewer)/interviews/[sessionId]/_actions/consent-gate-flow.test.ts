/**
 * 面接官同意フロー E2E（critical path）の統合テスト（DB バックド）。
 *
 * jsdom コンポーネントテスト（consent-step.test.tsx / capture-start-panel 側）が UI 半分
 * （未同意で開始ボタン disabled・同意ステップ描画・チェック→確定→recordConsent→router.refresh）
 * を既に検証済みのため、本ファイルは UI が実際にトリガーする「サーバー側の状態遷移」を
 * 実アクション（startCapture / recordConsent）＋実 DB で通しで検証する:
 *
 *   1. 未同意セッションを作成する
 *   2. startCapture（mic）→ ゲートで CONSENT_REQUIRED 拒否・DB 未変化を確認
 *   3. recordConsent → 成功・consent 4 列が整合状態で永続化されることを確認
 *   4. startCapture（mic）→ ゲート解禁で開始許可・capture_status='recording' を確認
 *
 * recall（会議ボット）経路ではなく mic 経路を使うのは、外部 Recall API 依存を排除し
 * ゲートの実効化そのもの（consent_obtained_at の非 null 遷移）に検証を絞るため。
 *
 * Requirements: 2.1, 2.2, 1.1, 1.2
 * Design: System Flows「同意取得 → ゲート通過（面接官アテステーション）」
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
const { TEST_USER_ID } = vi.hoisted(() => ({
  TEST_USER_ID: 'consent-gate-flow-test-user-fixed-id',
}));

/**
 * @bulr/auth/server のモック。
 * authedAction を固定 userId passthrough に差し替える。
 * requireSessionOwnership と AuthError は実装を再現した互換実装を提供する。
 * （capture-actions.test.ts / record-consent.test.ts と同一のモック方針）
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { startCapture } from './start-capture';
import { recordConsent } from './record-consent';
import { CURRENT_CONSENT_VERSION } from '@/lib/consent/consent-notice';

// ---------------------------------------------------------------------------
// DB ヘルパー
// ---------------------------------------------------------------------------

/** interview_session の consent / capture 関連カラムを読み取る */
async function readSession(id: string) {
  return db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, id),
  });
}

type StartCaptureHandlerResult = {
  ok: boolean;
  data?: { captureStatus: string; botId?: string };
  error?: { code: string; message?: string; retryable?: boolean; canSwitchToMic?: boolean };
};
type StartCaptureAuthResult =
  | { ok: true; data: StartCaptureHandlerResult }
  | { ok: false; error: { code: string; message?: string } };

type RecordConsentData = {
  consentObtainedAt: string;
  consentVersion: string;
  alreadyConsented: boolean;
};
type RecordConsentSuccess = { ok: true; data: RecordConsentData };
type RecordConsentFailure = { ok: false; error: { code: string; message?: string } };
type RecordConsentResult = RecordConsentSuccess | RecordConsentFailure;

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('面接官同意フロー E2E（critical path）', () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = crypto.randomUUID();

    // mic 経路のみ使用するため recall 関連 env は不要だが、
    // startCapture モジュールの読み込み経路を capture-actions.test.ts と揃えておく。
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

    // セッションをセッション作成直後（consent-gate 適用後の create-session）と同じ
    // 未同意状態（consent_obtained_at = null）で作成する。これがフローの起点。
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: TEST_USER_ID,
      status: 'draft',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'idle',
      consent_obtained_at: null,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();

    // FK 制約に従い session → user の順で削除
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID));
  });

  it('未同意セッション作成 → 開始がゲート拒否 → 同意記録 → ゲート解禁で開始できる', async () => {
    // ---------------------------------------------------------------------
    // 1. セッション作成直後は未同意（beforeEach で確認済みだが本フローの前提として明示）
    // ---------------------------------------------------------------------
    const initial = await readSession(sessionId);
    expect(initial?.consent_obtained_at).toBeNull();
    expect(initial?.capture_status).toBe('idle');

    // ---------------------------------------------------------------------
    // 2. startCapture（mic）→ ゲートで CONSENT_REQUIRED 拒否（Req 1.1, 1.2）
    // ---------------------------------------------------------------------
    const rejected = (await startCapture({
      sessionId,
      mode: { kind: 'mic' },
    })) as StartCaptureAuthResult;

    // authedAction の外層は ok:true（認証は通過）。業務ハンドラーが ok:false を返す。
    expect(rejected.ok).toBe(true);
    const rejectedHandlerResult = (rejected as { ok: true; data: StartCaptureHandlerResult }).data;
    expect(rejectedHandlerResult.ok).toBe(false);
    expect(rejectedHandlerResult.error?.code).toBe('CONSENT_REQUIRED');

    // ゲート拒否時は capture_status / status が変化していない
    const afterRejected = await readSession(sessionId);
    expect(afterRejected?.capture_status).toBe('idle');
    expect(afterRejected?.status).toBe('draft');
    expect(afterRejected?.consent_obtained_at).toBeNull();

    // ---------------------------------------------------------------------
    // 3. recordConsent（面接官アテステーション）→ 同意記録（Req 2.1, 2.2）
    // ---------------------------------------------------------------------
    const consentResult = (await recordConsent({ sessionId })) as RecordConsentResult;

    expect(consentResult.ok).toBe(true);
    const consentData = (consentResult as RecordConsentSuccess).data;
    expect(consentData.alreadyConsented).toBe(false);
    expect(consentData.consentVersion).toBe(CURRENT_CONSENT_VERSION);

    const afterConsent = await readSession(sessionId);
    expect(afterConsent?.consent_obtained_at).not.toBeNull();
    expect(afterConsent?.consent_version).toBe(CURRENT_CONSENT_VERSION);
    expect(afterConsent?.consent_method).toBe('interviewer_attestation');
    expect(afterConsent?.consent_actor_id).toBe(TEST_USER_ID);
    // 同意記録単独では capture 状態は変化しない（recordConsent の責務外）
    expect(afterConsent?.capture_status).toBe('idle');

    // ---------------------------------------------------------------------
    // 4. startCapture（mic）→ ゲート解禁で開始許可（Req 1.1, 1.2）
    //    UI 側では recordConsent 成功後の router.refresh() がこの再評価に相当する。
    // ---------------------------------------------------------------------
    const accepted = (await startCapture({
      sessionId,
      mode: { kind: 'mic' },
    })) as StartCaptureAuthResult;

    expect(accepted.ok).toBe(true);
    const acceptedHandlerResult = (accepted as { ok: true; data: StartCaptureHandlerResult }).data;
    expect(acceptedHandlerResult.ok).toBe(true);
    expect(acceptedHandlerResult.data?.captureStatus).toBe('recording');

    const afterAccepted = await readSession(sessionId);
    expect(afterAccepted?.capture_status).toBe('recording');
    expect(afterAccepted?.capture_provider).toBe('mic');
    expect(afterAccepted?.status).toBe('in_progress');
    expect(afterAccepted?.started_at).not.toBeNull();
    // 同意記録は startCapture 実行後も不変（4 列整合を維持）
    expect(afterAccepted?.consent_obtained_at).not.toBeNull();
    expect(afterAccepted?.consent_version).toBe(CURRENT_CONSENT_VERSION);
    expect(afterAccepted?.consent_method).toBe('interviewer_attestation');
    expect(afterAccepted?.consent_actor_id).toBe(TEST_USER_ID);
  });
});

/**
 * recordConsent Server Action の統合テスト（DB バックド）。
 *
 * - `@bulr/auth/server` の authedAction を passthrough モックに置換（Cookie 不要）
 * - session 状態の検証は実際の Docker Postgres に対して行う
 *
 * Requirements: 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.3, 6.1, 6.2, 6.3
 * Design: recordConsent (Service Interface, Responsibilities & Constraints)
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
const { TEST_USER_ID } = vi.hoisted(() => ({
  TEST_USER_ID: 'record-consent-test-user-fixed-id',
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { recordConsent } from './record-consent';
import { CURRENT_CONSENT_VERSION } from '@/lib/consent/consent-notice';

// ---------------------------------------------------------------------------
// DB ヘルパー
// ---------------------------------------------------------------------------

/** interview_session の consent 関連カラムを読み取る */
async function readSession(id: string) {
  return db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, id),
  });
}

type RecordConsentSuccess = {
  ok: true;
  data: {
    consentObtainedAt: string;
    consentVersion: string;
    alreadyConsented: boolean;
  };
};
type RecordConsentFailure = { ok: false; error: { code: string; message?: string } };

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('recordConsent Server Action', () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = crypto.randomUUID();

    // Better Auth ユーザーを挿入（interview_session.interviewer_id FK）
    await db.insert(schema.user).values({
      id: TEST_USER_ID,
      email: `test-${TEST_USER_ID}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // セッションを未同意状態で作成
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
    vi.restoreAllMocks();

    // FK 制約に従い session → user の順で削除
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID));
  });

  // -----------------------------------------------------------------------
  // 1. 未同意セッションで 4 列を単一更新で原子的に set する（Req 2.3, 3.1-3.4, 4.3）
  // -----------------------------------------------------------------------
  describe('未同意セッションでの同意記録', () => {
    it('consent_obtained_at / consent_version / consent_method / consent_actor_id を原子的に set し alreadyConsented:false を単段契約で返す', async () => {
      const result = (await recordConsent({ sessionId })) as
        | RecordConsentSuccess
        | RecordConsentFailure;

      // 単段契約: result.ok が業務成否も兼ねる（result.data.ok のような二重ラップは無い）
      expect(result.ok).toBe(true);
      const data = (result as RecordConsentSuccess).data;
      expect(data.alreadyConsented).toBe(false);
      // 版はサーバー側の現行版を stamp する（client からは version を送らない）
      expect(data.consentVersion).toBe(CURRENT_CONSENT_VERSION);
      expect(Number.isNaN(new Date(data.consentObtainedAt).getTime())).toBe(false);

      const dbSession = await readSession(sessionId);
      expect(dbSession?.consent_obtained_at).not.toBeNull();
      expect(dbSession?.consent_obtained_at?.toISOString()).toBe(data.consentObtainedAt);
      expect(dbSession?.consent_version).toBe(CURRENT_CONSENT_VERSION);
      expect(dbSession?.consent_method).toBe('interviewer_attestation');
      expect(dbSession?.consent_actor_id).toBe(TEST_USER_ID);
    });
  });

  // -----------------------------------------------------------------------
  // 2. 既に同意済みのセッションは冪等 no-op（Req 6.2）
  // -----------------------------------------------------------------------
  describe('冪等性', () => {
    it('既に同意済みのセッションでは書き込まず既存値を alreadyConsented:true で返す', async () => {
      const existingConsentDate = new Date('2026-01-01T00:00:00.000Z');
      await db
        .update(schema.interviewSession)
        .set({
          consent_obtained_at: existingConsentDate,
          consent_version: CURRENT_CONSENT_VERSION,
          consent_method: 'interviewer_attestation',
          consent_actor_id: TEST_USER_ID,
        })
        .where(eq(schema.interviewSession.id, sessionId));

      const result = (await recordConsent({ sessionId })) as
        | RecordConsentSuccess
        | RecordConsentFailure;

      expect(result.ok).toBe(true);
      const data = (result as RecordConsentSuccess).data;
      expect(data.alreadyConsented).toBe(true);
      expect(data.consentObtainedAt).toBe(existingConsentDate.toISOString());
      expect(data.consentVersion).toBe(CURRENT_CONSENT_VERSION);

      // DB の値は変わっていない（再書き込みされていない）
      const dbSession = await readSession(sessionId);
      expect(dbSession?.consent_obtained_at?.getTime()).toBe(existingConsentDate.getTime());
    });
  });

  // -----------------------------------------------------------------------
  // 3. 存在しないセッション（Req 6.1 の一部：担当関係が成立しない）
  // -----------------------------------------------------------------------
  describe('存在しないセッション', () => {
    it('NOT_FOUND で拒否される', async () => {
      const result = (await recordConsent({ sessionId: crypto.randomUUID() })) as
        | RecordConsentSuccess
        | RecordConsentFailure;

      expect(result.ok).toBe(false);
      expect((result as RecordConsentFailure).error.code).toBe('NOT_FOUND');
    });
  });

  // -----------------------------------------------------------------------
  // 4. 所有権チェック（Req 6.1）
  // -----------------------------------------------------------------------
  describe('所有権チェック', () => {
    let anotherUserId: string;

    beforeEach(async () => {
      anotherUserId = crypto.randomUUID();
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
    });

    afterEach(async () => {
      await db
        .update(schema.interviewSession)
        .set({ interviewer_id: TEST_USER_ID })
        .where(eq(schema.interviewSession.id, sessionId));
      await db.delete(schema.user).where(eq(schema.user.id, anotherUserId));
    });

    it('非担当者からの呼び出しは FORBIDDEN で拒否され書き込まれない', async () => {
      const result = (await recordConsent({ sessionId })) as
        | RecordConsentSuccess
        | RecordConsentFailure;

      expect(result.ok).toBe(false);
      expect((result as RecordConsentFailure).error.code).toBe('FORBIDDEN');

      const dbSession = await readSession(sessionId);
      expect(dbSession?.consent_obtained_at).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 5. 入力バリデーション
  // -----------------------------------------------------------------------
  describe('入力バリデーション', () => {
    it('空文字列の sessionId は Zod バリデーションで拒否される', async () => {
      const result = (await recordConsent({ sessionId: '' })) as
        | RecordConsentSuccess
        | RecordConsentFailure;

      expect(result.ok).toBe(false);
    });
  });
});

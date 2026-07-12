/**
 * createSession Server Action の統合テスト（DB バックド）。
 *
 * interview-consent-gate spec（Task 3.1）: セッション作成時に consent 列を書かず
 * null で作成する（自動同意の停止）ことを検証する。
 *
 * - `@bulr/auth/server` の authedAction を passthrough モックに置換（Cookie 不要）
 * - `next/navigation` の redirect をセンチネル throw モックに置換し、
 *   遷移先 URL から作成された sessionId を取得する
 * - session 状態の検証は実際の Docker Postgres に対して行う
 *
 * Requirements: 2.4, 5.2
 * Design: Boundary Commitments（セッション作成時に consent 列を未同意（null）で開始させること）
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
const { TEST_USER_ID, mockRedirectTarget } = vi.hoisted(() => ({
  TEST_USER_ID: 'create-session-test-user-fixed-id',
  mockRedirectTarget: { value: null as string | null },
}));

/**
 * @bulr/auth/server のモック。
 * authedAction を固定 userId passthrough に差し替える。
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function authedAction(schema: any, handler: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (rawInput: unknown): Promise<any> => {
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

  return { AuthError, authedAction };
});

/**
 * next/navigation redirect のモック。
 * createSession はトランザクション外で redirect() を throw するため、
 * センチネルエラーとして捕捉し、遷移先 URL から sessionId を取り出す。
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    mockRedirectTarget.value = url;
    throw new Error('NEXT_REDIRECT_SENTINEL');
  }),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { createSession } from './create-session';

// ---------------------------------------------------------------------------
// DB ヘルパー
// ---------------------------------------------------------------------------

/** interview_session の consent 関連カラムを読み取る */
async function readSession(id: string) {
  return db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, id),
  });
}

/** redirect 先 URL '/interviews/{sessionId}' から sessionId を取り出す */
function extractSessionIdFromRedirect(url: string | null): string {
  if (!url) throw new Error('redirect が呼ばれていません');
  const match = url.match(/^\/interviews\/(.+)$/);
  if (!match) throw new Error(`予期しない redirect URL: ${url}`);
  return match[1]!;
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('createSession Server Action', () => {
  let createdSessionId: string | null = null;
  let createdCandidateId: string | null = null;

  beforeEach(async () => {
    mockRedirectTarget.value = null;
    createdSessionId = null;
    createdCandidateId = null;
    vi.clearAllMocks();

    // Better Auth ユーザーを挿入（interview_session.interviewer_id FK）
    await db.insert(schema.user).values({
      id: TEST_USER_ID,
      email: `test-${TEST_USER_ID}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // FK 制約に従い session → candidate → user の順で削除
    if (createdSessionId) {
      await db.delete(schema.interviewSession).where(eq(schema.interviewSession.id, createdSessionId));
    }
    if (createdCandidateId) {
      await db.delete(schema.candidate).where(eq(schema.candidate.id, createdCandidateId));
    }
    await db.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID));
  });

  // -----------------------------------------------------------------------
  // 自動同意の停止（Req 2.4, 5.2）
  // -----------------------------------------------------------------------
  describe('新規セッション作成時の同意状態', () => {
    it('consent_obtained_at / consent_method / consent_actor_id を書き込まず未同意（null）で作成する', async () => {
      // redirect がセンチネルを throw するため、呼び出しは reject する
      await expect(
        createSession({
          name: 'テスト候補者',
          applied_role: 'バックエンドエンジニア',
          background_summary: 'Node.js と Postgres を用いたバックエンド開発の経験があります。',
        }),
      ).rejects.toThrow('NEXT_REDIRECT_SENTINEL');

      createdSessionId = extractSessionIdFromRedirect(mockRedirectTarget.value);

      const dbSession = await readSession(createdSessionId);
      createdCandidateId = dbSession?.candidate_id ?? null;

      expect(dbSession).toBeDefined();
      // Requirement 5.2: 新規に面接セッションが作成された場合、同意取得の記録が無い状態で開始する
      expect(dbSession?.consent_obtained_at).toBeNull();
      // Requirement 2.4: 同意の確定は面接官の明示操作によってのみ発生する（作成時は method/actor も無い）
      expect(dbSession?.consent_method).toBeNull();
      expect(dbSession?.consent_actor_id).toBeNull();
      // consent_version は notNull default を維持（task 1.1）。未同意判定は consent_obtained_at のみで行う。
      expect(dbSession?.consent_version).toBe('ja-v1');
    });
  });
});

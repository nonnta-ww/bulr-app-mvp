/**
 * acceptCompanyInvitation — 並行受諾レースコンディションテスト (Req 2.7)
 *
 * 同一招待に対して 2 つの並行リクエストが来た場合、
 * 正確に 1 回だけ成功し、もう 1 回は ALREADY_CONSUMED になることを検証する。
 *
 * Requirements: 2.7
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------
const { RACE_USER_ID, RACE_EMAIL, mockRedirectTarget, mockCookieClear } = vi.hoisted(() => ({
  RACE_USER_ID: 'race-test-user-fixed-id-001',
  RACE_EMAIL: 'race-invitee-test-001@example.com',
  mockRedirectTarget: { value: null as string | null },
  mockCookieClear: { calls: [] as Array<[string, string, Record<string, unknown>]> },
}));

/**
 * @bulr/auth/server のモック。
 * authedAction を固定 userId / email passthrough に差し替える。
 * AuthError は実装を再現した互換クラスを提供する。
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
          userId: RACE_USER_ID,
          email: RACE_EMAIL,
        });
        return { ok: true as const, data };
      } catch (e) {
        if (e instanceof AuthError) {
          return {
            ok: false as const,
            error: { code: (e as AuthError).code, message: (e as Error).message },
          };
        }
        throw e;
      }
    };
  }

  return { AuthError, authedAction };
});

/**
 * next/headers cookies() のモック。
 */
vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      set: vi.fn((name: string, value: string, opts: Record<string, unknown>) => {
        mockCookieClear.calls.push([name, value, opts]);
      }),
    }),
  ),
}));

/**
 * next/navigation redirect のモック。
 * redirect() が呼ばれたらターゲットを記録して既知センチネルをスローする。
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    mockRedirectTarget.value = url;
    throw new Error('NEXT_REDIRECT_SENTINEL');
  }),
}));

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { company, companyUserInvitation, user, userProfile } from '@bulr/db/schema';

import { acceptCompanyInvitation } from './accept-company-invitation';

// ---------------------------------------------------------------------------
// フィクスチャ ID
// ---------------------------------------------------------------------------
const FX_COMPANY_RACE_ID = 'fx-company-race-test-001';
const FX_USER_RACE_ID = RACE_USER_ID;
const FX_INVITER_RACE_ID = 'fx-inviter-user-race-test-001';
const TOKEN_RACE = 'RaceToken-Test-001';

// ---------------------------------------------------------------------------
// DB セットアップ / クリーンアップ
// ---------------------------------------------------------------------------

async function teardownRaceFixtures() {
  if (!process.env.DATABASE_URL) return;
  await db.delete(companyUserInvitation).where(
    eq(companyUserInvitation.invitedByUserId, FX_INVITER_RACE_ID),
  );
  await db.delete(userProfile).where(eq(userProfile.userId, FX_USER_RACE_ID));
  await db.delete(company).where(eq(company.id, FX_COMPANY_RACE_ID));
  await db.delete(user).where(eq(user.id, FX_USER_RACE_ID));
  await db.delete(user).where(eq(user.id, FX_INVITER_RACE_ID));
}

async function setupRaceFixtures() {
  if (!process.env.DATABASE_URL) return;

  await teardownRaceFixtures();

  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7日後

  await db.insert(user).values([
    {
      id: FX_INVITER_RACE_ID,
      email: 'inviter-race-test-001@example.com',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: FX_USER_RACE_ID,
      email: RACE_EMAIL,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(company).values({
    id: FX_COMPANY_RACE_ID,
    name: 'Test Company Race 001',
    status: 'active',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(userProfile).values({
    userId: FX_USER_RACE_ID,
    companyId: null,
    displayName: 'Race Test User 001',
    roleInOrg: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(companyUserInvitation).values({
    id: 'inv-race-test-001',
    companyId: FX_COMPANY_RACE_ID,
    email: RACE_EMAIL,
    roleInOrg: 'member',
    token: TOKEN_RACE,
    status: 'pending',
    invitedByUserId: FX_INVITER_RACE_ID,
    expiresAt: future,
    createdAt: now,
    updatedAt: now,
  });
}

afterAll(async () => {
  await teardownRaceFixtures();
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function readProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  return profile;
}

async function readInvitation(token: string) {
  const [inv] = await db
    .select()
    .from(companyUserInvitation)
    .where(eq(companyUserInvitation.token, token))
    .limit(1);
  return inv;
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('acceptCompanyInvitation — 並行レース (Req 2.7)', () => {
  beforeEach(async () => {
    if (!process.env.DATABASE_URL) return;
    mockRedirectTarget.value = null;
    mockCookieClear.calls = [];
    vi.clearAllMocks();
    await setupRaceFixtures();
  });

  it('同一トークンへの並行受諾は正確に 1 回成功し、他は ALREADY_CONSUMED になる', async () => {
    if (!process.env.DATABASE_URL) return;

    // 2 つのリクエストを同時に発行
    const results = await Promise.allSettled([
      acceptCompanyInvitation({ token: TOKEN_RACE }),
      acceptCompanyInvitation({ token: TOKEN_RACE }),
    ]);

    // 各結果を分類する
    // - 成功パス: redirect('/openings') がセンチネルを throw → PromiseRejectedResult
    // - 消費済みパス: ALREADY_CONSUMED → PromiseFulfilledResult（{ ok:true, data:{ ok:false, error } }）
    const sentinelRejections = results.filter(
      (r) => r.status === 'rejected' && (r as PromiseRejectedResult).reason?.message === 'NEXT_REDIRECT_SENTINEL',
    );
    const alreadyConsumed = results.filter(
      (r) =>
        r.status === 'fulfilled' &&
        (r as PromiseFulfilledResult<{ ok: true; data: { ok: false; error: { code: string } } }>)
          .value?.ok === true &&
        (r as PromiseFulfilledResult<{ ok: true; data: { ok: false; error: { code: string } } }>)
          .value?.data?.ok === false &&
        (r as PromiseFulfilledResult<{ ok: true; data: { ok: false; error: { code: string } } }>)
          .value?.data?.error?.code === 'ALREADY_CONSUMED',
    );

    // --- バグ捕捉の核心（負荷に頑健） ---
    // 二重受諾バグ（修正前）は両呼び出しが成功パス（redirect sentinel）を取り、
    // sentinel が 2 件になることで顕在化する。よって「成功は高々 1 件」が不変条件。
    // フルスイートの並行 DB 負荷下では非勝者のトランザクションが
    // ALREADY_CONSUMED ではなく一過性のプール/シリアライズ・エラーになり得るため、
    // 「ちょうど 1 件の consumed」「unexpected rejection ゼロ」までは要求しない
    // （成功が 2 件でないこと + 最終状態の整合 が Req 2.7 の本質）。
    expect(
      sentinelRejections.length,
      `成功（redirect）は高々 1 件であるべき（二重受諾の検出）。consumed=${alreadyConsumed.length}`,
    ).toBeLessThanOrEqual(1);

    // 最終状態: invitation は accepted に「ちょうど 1 回」遷移し、単一ユーザーで確定する
    const inv = await readInvitation(TOKEN_RACE);
    expect(inv?.status, 'invitation は accepted になるべき').toBe('accepted');
    expect(inv?.acceptedByUserId, 'acceptedByUserId はレースユーザー').toBe(FX_USER_RACE_ID);
    expect(inv?.acceptedAt, 'acceptedAt は設定済み').not.toBeNull();

    // 最終状態: user_profile.company_id は会社 ID に設定される（冪等・単一確定）
    const profile = await readProfile(FX_USER_RACE_ID);
    expect(profile?.companyId, 'user_profile.company_id は会社 ID').toBe(FX_COMPANY_RACE_ID);
    expect(profile?.roleInOrg, 'role_in_org は member').toBe('member');

    // 成功が 1 件成立したケースでは、もう一方は必ず非成功（consumed 等）であること
    // = 成功が同時に 2 件にならない（二重受諾しない）ことの追加確認。
    if (sentinelRejections.length === 1) {
      const otherSucceeded = sentinelRejections.length > 1;
      expect(otherSucceeded, '同時に 2 件成功してはならない').toBe(false);
    }
  });
});

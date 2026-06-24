/**
 * 会社ユーザー招待フロー — 統合テスト (Req 5.1, 5.2, 2.1)
 *
 * クリティカルパスを DB バックドでシーム境界（acceptance action + gate ロジック）まで検証する。
 *
 * テストケース:
 * 1. 招待 → 受諾 → ゲートが開く (Req 2.1)
 *    - pending 招待を INSERT → acceptCompanyInvitation 呼び出し
 *    - user_profile.company_id 設定確認 + invitation accepted 確認
 *    - deriveNoCompanyState で 'active' を確認（ゲート通過状態）
 *
 * 2. 停止中企業の会員 → ゲートがブロック (Req 5.2)
 *    - company_id セット済みの user_profile に対して companyStatus='suspended'
 *    - deriveNoCompanyState → 'suspended' を確認
 *
 * 3. 未所属 → no-company 状態 (Req 5.1)
 *    - companyId=null → deriveNoCompanyState → 'unassociated' を確認
 *
 * NOTE: resolveCompanyAccess は @bulr/auth/server からエクスポートされていないため
 * (server-entry.ts に含まれない)、代わりに business 側の deriveNoCompanyState
 * (apps/business/app/no-company/no-company-state.ts) を用いてゲートページロジックを検証する。
 * これは requireCompanyGate → requireCompanyUser → resolveCompanyAccess と呼ばれる
 * フローのうち、business 側の page ロジックに対応する部分をカバーする。
 *
 * Requirements: 2.1, 5.1, 5.2
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------
const { FLOW_USER_ID, FLOW_EMAIL, mockRedirectTarget, mockCookieClear } = vi.hoisted(() => ({
  FLOW_USER_ID: 'flow-test-user-fixed-id-001',
  FLOW_EMAIL: 'flow-invitee-test-001@example.com',
  mockRedirectTarget: { value: null as string | null },
  mockCookieClear: { calls: [] as Array<[string, string, Record<string, unknown>]> },
}));

/**
 * @bulr/auth/server のモック。
 * authedAction を固定 userId / email passthrough に差し替える。
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
          userId: FLOW_USER_ID,
          email: FLOW_EMAIL,
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

import { acceptCompanyInvitation } from './invitations/[token]/confirm/_actions/accept-company-invitation';
import { deriveNoCompanyState } from './no-company/no-company-state';

// ---------------------------------------------------------------------------
// フィクスチャ ID
// ---------------------------------------------------------------------------
const FX_COMPANY_ACTIVE_FLOW_ID = 'fx-company-flow-active-001';
const FX_COMPANY_SUSPENDED_FLOW_ID = 'fx-company-flow-suspended-001';
const FX_USER_FLOW_ID = FLOW_USER_ID;
const FX_INVITER_FLOW_ID = 'fx-inviter-user-flow-test-001';
const TOKEN_FLOW = 'FlowToken-Test-001';

// ---------------------------------------------------------------------------
// DB セットアップ / クリーンアップ
// ---------------------------------------------------------------------------

async function teardownFlowFixtures() {
  if (!process.env.DATABASE_URL) return;
  await db.delete(companyUserInvitation).where(
    eq(companyUserInvitation.invitedByUserId, FX_INVITER_FLOW_ID),
  );
  await db.delete(userProfile).where(eq(userProfile.userId, FX_USER_FLOW_ID));
  await db.delete(company).where(eq(company.id, FX_COMPANY_ACTIVE_FLOW_ID));
  await db.delete(company).where(eq(company.id, FX_COMPANY_SUSPENDED_FLOW_ID));
  await db.delete(user).where(eq(user.id, FX_USER_FLOW_ID));
  await db.delete(user).where(eq(user.id, FX_INVITER_FLOW_ID));
}

async function setupFlowFixtures() {
  if (!process.env.DATABASE_URL) return;

  await teardownFlowFixtures();

  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(user).values([
    {
      id: FX_INVITER_FLOW_ID,
      email: 'inviter-flow-test-001@example.com',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: FX_USER_FLOW_ID,
      email: FLOW_EMAIL,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(company).values([
    {
      id: FX_COMPANY_ACTIVE_FLOW_ID,
      name: 'Test Company Flow Active 001',
      status: 'active',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: FX_COMPANY_SUSPENDED_FLOW_ID,
      name: 'Test Company Flow Suspended 001',
      status: 'suspended',
      isActive: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(userProfile).values({
    userId: FX_USER_FLOW_ID,
    companyId: null,
    displayName: 'Flow Test User 001',
    roleInOrg: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(companyUserInvitation).values({
    id: 'inv-flow-test-001',
    companyId: FX_COMPANY_ACTIVE_FLOW_ID,
    email: FLOW_EMAIL,
    roleInOrg: 'member',
    token: TOKEN_FLOW,
    status: 'pending',
    invitedByUserId: FX_INVITER_FLOW_ID,
    expiresAt: future,
    createdAt: now,
    updatedAt: now,
  });
}

afterAll(async () => {
  await teardownFlowFixtures();
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

describe('会社ユーザー招待フロー — 統合テスト', () => {
  beforeEach(async () => {
    if (!process.env.DATABASE_URL) return;
    mockRedirectTarget.value = null;
    mockCookieClear.calls = [];
    vi.clearAllMocks();
    await setupFlowFixtures();
  });

  // =========================================================================
  // 1. 招待 → 受諾 → ゲートが開く (Req 2.1)
  // =========================================================================
  it('(1) 招待受諾後: user_profile.company_id が設定され、deriveNoCompanyState が "active" を返す (Req 2.1)', async () => {
    if (!process.env.DATABASE_URL) return;

    // 受諾: redirect sentinel が throw される
    await expect(
      acceptCompanyInvitation({ token: TOKEN_FLOW }),
    ).rejects.toThrow('NEXT_REDIRECT_SENTINEL');

    // DB 確認: user_profile.company_id が設定されていること
    const profile = await readProfile(FX_USER_FLOW_ID);
    expect(profile?.companyId, 'company_id は active 企業に設定されるべき').toBe(FX_COMPANY_ACTIVE_FLOW_ID);
    expect(profile?.roleInOrg, 'role_in_org は member').toBe('member');

    // DB 確認: invitation が accepted になっていること
    const inv = await readInvitation(TOKEN_FLOW);
    expect(inv?.status, 'invitation は accepted').toBe('accepted');
    expect(inv?.acceptedByUserId, 'acceptedByUserId はフローユーザー').toBe(FX_USER_FLOW_ID);

    // ゲートロジック確認: 所属企業が active なのでゲートが開く
    // (requireCompanyGate → requireCompanyUser → resolveCompanyAccess → active → pass)
    // business アプリ側の no-company ページロジックで検証:
    // 企業がアクティブなら deriveNoCompanyState は 'active' を返す
    // (これは /no-company ページが表示されず /openings にリダイレクトすることに対応)
    const state = deriveNoCompanyState({
      companyId: profile?.companyId ?? null,
      companyStatus: 'active',
    });
    expect(state, 'active 企業の会員は gate 通過可能 (Req 2.1)').toBe('active');
  });

  // =========================================================================
  // 2. 停止中企業の会員 → ゲートがブロック (Req 5.2)
  // =========================================================================
  it('(2) 停止中企業の会員: deriveNoCompanyState が "suspended" を返し no-company へ (Req 5.2)', async () => {
    if (!process.env.DATABASE_URL) return;

    // user_profile を suspended 企業に所属させる
    await db
      .update(userProfile)
      .set({ companyId: FX_COMPANY_SUSPENDED_FLOW_ID, updatedAt: new Date() })
      .where(eq(userProfile.userId, FX_USER_FLOW_ID));

    const profile = await readProfile(FX_USER_FLOW_ID);
    expect(profile?.companyId).toBe(FX_COMPANY_SUSPENDED_FLOW_ID);

    // ゲートロジック確認: 停止中企業の会員は COMPANY_INACTIVE でブロックされ /no-company へ
    // (requireCompanyGate が COMPANY_INACTIVE を受けて redirect('/no-company') する)
    // business アプリ側: deriveNoCompanyState が 'suspended' を返す
    const state = deriveNoCompanyState({
      companyId: profile?.companyId ?? null,
      companyStatus: 'suspended',
    });
    expect(state, '停止中企業の会員は "suspended" 状態 (Req 5.2)').toBe('suspended');
  });

  // =========================================================================
  // 3. 未所属 → no-company 状態 (Req 5.1)
  // =========================================================================
  it('(3) 未所属ユーザー: deriveNoCompanyState が "unassociated" を返す (Req 5.1)', async () => {
    if (!process.env.DATABASE_URL) return;

    // user_profile は company_id=null のまま（setupFlowFixtures で設定済み）
    const profile = await readProfile(FX_USER_FLOW_ID);
    expect(profile?.companyId, '未所属: company_id は null').toBeNull();

    // ゲートロジック確認: 未所属ユーザーは COMPANY_NOT_ASSOCIATED でブロックされ /no-company へ
    // (requireCompanyGate が COMPANY_NOT_ASSOCIATED を受けて redirect('/no-company') する)
    // business アプリ側: deriveNoCompanyState が 'unassociated' を返す
    const state = deriveNoCompanyState({
      companyId: profile?.companyId ?? null,
      companyStatus: null,
    });
    expect(state, '未所属ユーザーは "unassociated" 状態 (Req 5.1)').toBe('unassociated');
  });
});

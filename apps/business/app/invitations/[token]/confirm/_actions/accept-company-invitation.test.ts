/**
 * acceptCompanyInvitation Server Action の DB バックド統合テスト
 *
 * 検証観点 (Req 2.1, 2.2, 2.3, 2.5, 2.6, 6.4):
 * 1. 成功: user_profile.company_id + role_in_org 設定 & invitation accepted & redirect('/openings')
 * 2. 期限切れ: EXPIRED / profile 変更なし / invitation pending のまま
 * 3. 取り消し済み: REVOKED
 * 4. 受諾済み: ALREADY_CONSUMED
 * 5. 会社停止中: COMPANY_INACTIVE
 * 6. メール不一致: EMAIL_MISMATCH / profile 変更なし
 * 7. 既に会社所属: ALREADY_MEMBER
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 6.4
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------
const { TEST_USER_ID, TEST_EMAIL, mockRedirectTarget, mockCookieClear } = vi.hoisted(() => ({
  TEST_USER_ID: 'accept-inv-test-user-fixed-id-001',
  TEST_EMAIL: 'invitee-test-001@example.com',
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
          userId: TEST_USER_ID,
          email: TEST_EMAIL,
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
 * cookie クリアを捕捉するが副作用は起こさない。
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

// RED フェーズ: ファイルがまだ存在しないため import が失敗する想定
import { acceptCompanyInvitation } from './accept-company-invitation';

// ---------------------------------------------------------------------------
// フィクスチャ ID
// ---------------------------------------------------------------------------
const FX_COMPANY_ACTIVE_ID = 'fx-company-accept-inv-active-001';
const FX_COMPANY_SUSPENDED_ID = 'fx-company-accept-inv-susp-001';
const FX_USER_AUTH_ID = TEST_USER_ID;
const FX_INVITER_USER_ID = 'fx-inviter-user-accept-test-001';

// トークン定数 (各テスト用)
const TOKEN_VALID = 'ValidToken-Accept-Test-001';
const TOKEN_EXPIRED = 'ExpiredToken-Accept-Test-001';
const TOKEN_REVOKED = 'RevokedToken-Accept-Test-001';
const TOKEN_ACCEPTED = 'AcceptedToken-Accept-Test-001';
const TOKEN_INACTIVE = 'InactiveToken-Accept-Test-001';
const TOKEN_MISMATCH = 'MismatchToken-Accept-Test-001';
// テスト 7 は TOKEN_VALID を再利用（user_profile.company_id を事前セット）

// ---------------------------------------------------------------------------
// DB セットアップ / クリーンアップ
// ---------------------------------------------------------------------------

async function teardownFixtures() {
  if (!process.env.DATABASE_URL) return;
  // FK 制約に従い: companyUserInvitation → userProfile → company → user の順で削除
  await db.delete(companyUserInvitation).where(
    eq(companyUserInvitation.invitedByUserId, FX_INVITER_USER_ID),
  );
  await db.delete(userProfile).where(eq(userProfile.userId, FX_USER_AUTH_ID));
  await db.delete(company).where(eq(company.id, FX_COMPANY_ACTIVE_ID));
  await db.delete(company).where(eq(company.id, FX_COMPANY_SUSPENDED_ID));
  await db.delete(user).where(eq(user.id, FX_USER_AUTH_ID));
  await db.delete(user).where(eq(user.id, FX_INVITER_USER_ID));
}

async function setupFixtures() {
  if (!process.env.DATABASE_URL) return;

  // 毎回クリーンな状態から始める
  await teardownFixtures();

  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7日後
  const past = new Date(now.getTime() - 1000); // 1秒前（期限切れ）

  // Better Auth ユーザー挿入（招待発行者 + 受諾ユーザー）
  await db.insert(user).values([
    {
      id: FX_INVITER_USER_ID,
      email: 'inviter-accept-test-001@example.com',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: FX_USER_AUTH_ID,
      email: TEST_EMAIL,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // 会社（active + suspended）
  await db.insert(company).values([
    {
      id: FX_COMPANY_ACTIVE_ID,
      name: 'Test Company Active Accept 001',
      status: 'active',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: FX_COMPANY_SUSPENDED_ID,
      name: 'Test Company Suspended Accept 001',
      status: 'suspended',
      isActive: false,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // user_profile（受諾ユーザー: company_id null = 未所属）
  await db.insert(userProfile).values({
    userId: FX_USER_AUTH_ID,
    companyId: null,
    displayName: 'Invitee Test User 001',
    roleInOrg: null,
    createdAt: now,
    updatedAt: now,
  });

  // 招待レコード群
  //
  // partial unique index: (company_id, email) WHERE status = 'pending'
  // → 同一 company_id + email で pending は最大1行のみ。
  //
  // 回避戦略:
  // - TOKEN_VALID: company=ACTIVE, email=TEST_EMAIL, status=pending         → OK
  // - TOKEN_EXPIRED: company=ACTIVE, email='expired-test@example.com', status=pending → OK (別email)
  //   ※ EXPIRED チェックはメールチェックより前に行うため email が TEST_EMAIL でなくてもよい
  // - TOKEN_REVOKED: company=ACTIVE, email=TEST_EMAIL, status=revoked       → OK (non-pending)
  // - TOKEN_ACCEPTED: company=ACTIVE, email=TEST_EMAIL, status=accepted     → OK (non-pending)
  // - TOKEN_INACTIVE: company=SUSPENDED, email=TEST_EMAIL, status=pending   → OK (別company)
  // - TOKEN_MISMATCH: company=ACTIVE, email='diff@example.com', status=pending → OK (別email)
  //
  // テスト 7 (ALREADY_MEMBER): TOKEN_VALID を使い、事前に user_profile.company_id をセット
  await db.insert(companyUserInvitation).values([
    {
      id: 'inv-valid-accept-001',
      companyId: FX_COMPANY_ACTIVE_ID,
      email: TEST_EMAIL,
      roleInOrg: 'member',
      token: TOKEN_VALID,
      status: 'pending',
      invitedByUserId: FX_INVITER_USER_ID,
      expiresAt: future,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inv-expired-accept-001',
      companyId: FX_COMPANY_ACTIVE_ID,
      email: 'expired-test-accept@example.com', // 別メール → partial unique 回避
      roleInOrg: 'member',
      token: TOKEN_EXPIRED,
      status: 'pending',
      invitedByUserId: FX_INVITER_USER_ID,
      expiresAt: past,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inv-revoked-accept-001',
      companyId: FX_COMPANY_ACTIVE_ID,
      email: TEST_EMAIL,
      roleInOrg: 'member',
      token: TOKEN_REVOKED,
      status: 'revoked',  // non-pending → partial unique 対象外
      invitedByUserId: FX_INVITER_USER_ID,
      expiresAt: future,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inv-accepted-accept-001',
      companyId: FX_COMPANY_ACTIVE_ID,
      email: TEST_EMAIL,
      roleInOrg: 'member',
      token: TOKEN_ACCEPTED,
      status: 'accepted', // non-pending → partial unique 対象外
      invitedByUserId: FX_INVITER_USER_ID,
      expiresAt: future,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inv-inactive-accept-001',
      companyId: FX_COMPANY_SUSPENDED_ID, // 別会社 → partial unique 対象外
      email: TEST_EMAIL,
      roleInOrg: 'member',
      token: TOKEN_INACTIVE,
      status: 'pending',
      invitedByUserId: FX_INVITER_USER_ID,
      expiresAt: future,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inv-mismatch-accept-001',
      companyId: FX_COMPANY_ACTIVE_ID,
      email: 'different-email-accept@example.com', // 別メール → partial unique 回避
      roleInOrg: 'member',
      token: TOKEN_MISMATCH,
      status: 'pending',
      invitedByUserId: FX_INVITER_USER_ID,
      expiresAt: future,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

afterAll(async () => {
  await teardownFixtures();
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** user_profile の現在状態を DB から読む */
async function readProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  return profile;
}

/** company_user_invitation の現在状態を DB から読む */
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

describe('acceptCompanyInvitation', () => {
  beforeEach(async () => {
    if (!process.env.DATABASE_URL) return;
    mockRedirectTarget.value = null;
    mockCookieClear.calls = [];
    vi.clearAllMocks();
    await setupFixtures();
  });

  // =========================================================================
  // 1. 成功: company_id + role_in_org 設定、invitation accepted、redirect('/openings')
  // =========================================================================
  it('(1) 成功: user_profile.company_id と role_in_org が設定され invitation が accepted になり /openings にリダイレクト (Req 2.1, 2.2)', async () => {
    if (!process.env.DATABASE_URL) return;

    // redirect() がセンチネルをスローするため try/catch する
    await expect(acceptCompanyInvitation({ token: TOKEN_VALID })).rejects.toThrow(
      'NEXT_REDIRECT_SENTINEL',
    );

    // redirect 先が /openings であること（Req 2.2）
    expect(mockRedirectTarget.value).toBe('/openings');

    // user_profile.company_id と role_in_org が設定されていること（Req 2.1）
    const profile = await readProfile(FX_USER_AUTH_ID);
    expect(profile?.companyId).toBe(FX_COMPANY_ACTIVE_ID);
    expect(profile?.roleInOrg).toBe('member');

    // invitation が accepted 状態になっていること（Req 2.2）
    const inv = await readInvitation(TOKEN_VALID);
    expect(inv?.status).toBe('accepted');
    expect(inv?.acceptedAt).not.toBeNull();
    expect(inv?.acceptedByUserId).toBe(FX_USER_AUTH_ID);
  });

  // =========================================================================
  // 2. 期限切れ: EXPIRED、profile 変更なし、invitation pending のまま
  // =========================================================================
  it('(2) 期限切れ招待 → EXPIRED エラー、profile 変更なし、invitation pending (Req 2.3)', async () => {
    if (!process.env.DATABASE_URL) return;

    const result = await acceptCompanyInvitation({ token: TOKEN_EXPIRED });

    // authedAction 外層: ok:true（認証通過）、data が { ok:false, error }
    expect(result.ok).toBe(true);
    const data = (
      result as { ok: true; data: { ok: false; error: { code: string; message: string } } }
    ).data;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('EXPIRED');

    // profile 変更なし
    const profile = await readProfile(FX_USER_AUTH_ID);
    expect(profile?.companyId).toBeNull();

    // invitation は pending のまま
    const inv = await readInvitation(TOKEN_EXPIRED);
    expect(inv?.status).toBe('pending');
  });

  // =========================================================================
  // 3. 取り消し済み: REVOKED
  // =========================================================================
  it('(3) 取り消し済み招待 → REVOKED エラー (Req 2.3)', async () => {
    if (!process.env.DATABASE_URL) return;

    const result = await acceptCompanyInvitation({ token: TOKEN_REVOKED });

    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { ok: false; error: { code: string } } }).data;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('REVOKED');
  });

  // =========================================================================
  // 4. 受諾済み: ALREADY_CONSUMED
  // =========================================================================
  it('(4) 受諾済み招待 → ALREADY_CONSUMED エラー (Req 2.3)', async () => {
    if (!process.env.DATABASE_URL) return;

    const result = await acceptCompanyInvitation({ token: TOKEN_ACCEPTED });

    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { ok: false; error: { code: string } } }).data;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('ALREADY_CONSUMED');
  });

  // =========================================================================
  // 5. 会社停止中: COMPANY_INACTIVE
  // =========================================================================
  it('(5) 停止中の会社への招待 → COMPANY_INACTIVE エラー (Req 2.6)', async () => {
    if (!process.env.DATABASE_URL) return;

    const result = await acceptCompanyInvitation({ token: TOKEN_INACTIVE });

    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { ok: false; error: { code: string } } }).data;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('COMPANY_INACTIVE');
  });

  // =========================================================================
  // 6. メール不一致: EMAIL_MISMATCH、profile 変更なし
  // =========================================================================
  it('(6) ctx.email と招待先メールが不一致 → EMAIL_MISMATCH エラー、profile 変更なし (Req 6.4)', async () => {
    if (!process.env.DATABASE_URL) return;

    const result = await acceptCompanyInvitation({ token: TOKEN_MISMATCH });

    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { ok: false; error: { code: string } } }).data;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('EMAIL_MISMATCH');

    // profile 変更なし
    const profile = await readProfile(FX_USER_AUTH_ID);
    expect(profile?.companyId).toBeNull();
  });

  // =========================================================================
  // 7. 既に会社所属: ALREADY_MEMBER
  //    TOKEN_VALID を使い、事前に user_profile.company_id をセットして呼ぶ
  // =========================================================================
  it('(7) 既に会社に所属しているユーザー → ALREADY_MEMBER エラー (Req 2.5)', async () => {
    if (!process.env.DATABASE_URL) return;

    // user_profile を会社所属状態にしてから受諾を試みる
    await db
      .update(userProfile)
      .set({ companyId: FX_COMPANY_ACTIVE_ID, updatedAt: new Date() })
      .where(eq(userProfile.userId, FX_USER_AUTH_ID));

    const result = await acceptCompanyInvitation({ token: TOKEN_VALID });

    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { ok: false; error: { code: string } } }).data;
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('ALREADY_MEMBER');

    // user_profile の company_id は変わっていない（既所属のまま）
    const profile = await readProfile(FX_USER_AUTH_ID);
    expect(profile?.companyId).toBe(FX_COMPANY_ACTIVE_ID);
  });
});

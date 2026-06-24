/**
 * createCompanyInvitation の DB バックド統合テスト
 *
 * 呼び出し規約:
 *   - adminAction は `Result<HandlerReturn>` を返す
 *     - 認証/Zod エラー → { ok: false, error: { code, message } }
 *     - それ以外 → { ok: true, data: HandlerReturn }
 *   - ハンドラ内のドメインエラーは HandlerReturn として { ok: false, error } を返すため、
 *     呼び出し側では result.ok && result.data.ok の 2 段確認が必要
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.4
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。
// vitest Node 環境では空モックに置換する。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// @bulr/auth/server のモック
// - adminAction: 実際の認証をスキップし、固定 ctx でハンドラを呼ぶパススルー実装
//   （実際の adminAction と同じく ZodError/AuthError はラップして ok:false を返し、
//    その他の return 値は { ok: true, data: ... } でラップする）
// - sendEmail: スパイ（呼び出しを記録するが副作用なし）
// ---------------------------------------------------------------------------

const { mockSendEmail } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@bulr/auth/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bulr/auth/server')>();
  return {
    ...original,
    adminAction: (
      schema: import('zod').ZodType,
      handler: (input: unknown, ctx: { userId: string; email: string }) => Promise<unknown>,
    ) => {
      return async (rawInput: unknown) => {
        try {
          const input = schema.parse(rawInput);
          const data = await handler(input, {
            userId: TEST_ADMIN_USER_ID,
            email: 'admin@example.com',
          });
          return { ok: true, data };
        } catch (e) {
          const { ZodError } = await import('zod');
          const { AuthError } = await import('@bulr/auth/server');
          if (e instanceof AuthError) {
            return { ok: false, error: { code: e.code, message: e.message } };
          }
          if (e instanceof ZodError) {
            return {
              ok: false,
              error: {
                code: 'INVALID_INPUT',
                message: (e as import('zod').ZodError).issues.map((i) => i.message).join(', '),
              },
            };
          }
          throw e;
        }
      };
    },
    sendEmail: mockSendEmail,
  };
});

// next/cache の revalidatePath はテスト環境では不要なためスタブ化
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '@bulr/db';
import { company, companyUserInvitation, user, userProfile } from '@bulr/db/schema';

/** テスト用のランダム短縮 ID（crypto.randomUUID の先頭 8 文字）を返す */
function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// テスト用の固定 admin ユーザー ID
const TEST_ADMIN_USER_ID = 'admin-user-test-' + shortId();

// テスト用フィクスチャ ID（各テストで共有）
let testCompanyId: string;
let existingMemberUserId: string;

// DB が使用可能かどうかの guard
const DB_AVAILABLE = !!process.env.DATABASE_URL;

/**
 * テスト用会社を挿入するヘルパー
 */
async function seedCompany(
  status: 'active' | 'suspended' | 'terminated' = 'active',
): Promise<string> {
  const id = shortId();
  await db.insert(company).values({
    id,
    name: `テスト会社 ${id.slice(0, 6)}`,
    status,
    isActive: status === 'active',
  });
  return id;
}

/**
 * テスト用 user + userProfile（会社所属済み）を挿入するヘルパー
 */
async function seedMemberUser(companyId: string): Promise<string> {
  const userId = shortId();
  const email = `member-${userId.slice(0, 6)}@example.com`;
  await db.insert(user).values({
    id: userId,
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(userProfile).values({
    userId,
    companyId,
    displayName: 'テストメンバー',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
}

/**
 * テスト用 admin user を挿入するヘルパー
 */
async function seedAdminUser(): Promise<void> {
  // テスト内で ctx.userId として使われる admin user を挿入（FK 制約のため）
  await db
    .insert(user)
    .values({
      id: TEST_ADMIN_USER_ID,
      email: 'admin@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

/**
 * アクションの結果からドメインエラーを取り出すヘルパー。
 * adminAction は常に { ok: true, data: HandlerReturn } を返す（認証エラー以外）。
 * ハンドラ内ドメインエラーは HandlerReturn が { ok: false, error } 形式。
 */
function extractDomainError(
  result: { ok: boolean; data?: unknown; error?: unknown },
): { ok: false; error: { code: string; message: string } } | null {
  if (!result.ok) {
    // 認証/Zod エラー（wrapper level）
    return result as { ok: false; error: { code: string; message: string } };
  }
  const data = result.data as { ok?: boolean; error?: { code: string; message: string } };
  if (data && data.ok === false) {
    // ドメインエラー（handler level）
    return { ok: false, error: data.error! };
  }
  return null;
}

describe.skipIf(!DB_AVAILABLE)('createCompanyInvitation integration', () => {
  beforeAll(async () => {
    await seedAdminUser();
    testCompanyId = await seedCompany('active');
    existingMemberUserId = await seedMemberUser(testCompanyId);
  });

  afterAll(async () => {
    // 招待レコードをクリーンアップ
    await db
      .delete(companyUserInvitation)
      .where(eq(companyUserInvitation.companyId, testCompanyId));
    // userProfile → user の順でクリーンアップ
    await db
      .delete(userProfile)
      .where(eq(userProfile.userId, existingMemberUserId));
    await db.delete(user).where(eq(user.id, existingMemberUserId));
    // 会社クリーンアップ
    await db.delete(company).where(eq(company.id, testCompanyId));
    // admin user クリーンアップ
    await db.delete(user).where(eq(user.id, TEST_ADMIN_USER_ID));
  });

  beforeEach(() => {
    mockSendEmail.mockClear();
    vi.stubEnv('BUSINESS_BASE_URL', 'http://localhost:3021');
  });

  // -----------------------------------------------------------------------
  // (1) 成功ケース
  // -----------------------------------------------------------------------
  it('(1) 正常: pending 招待が作成され sendEmail が呼ばれる', async () => {
    // 遅延インポート（vi.mock が先に適用されるため）
    const { createCompanyInvitation } = await import('./create-company-invitation');

    const email = `invite-success-${shortId()}@example.com`;
    const outerResult = await createCompanyInvitation({
      companyId: testCompanyId,
      email,
      roleInOrg: 'member',
    });

    // adminAction wrapper は ok:true を返す（認証エラーがないため）
    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) throw new Error('Expected wrapper ok=true');

    // ハンドラ result は { ok: true, data: { invitationId } }
    const handlerResult = outerResult.data as { ok: true; data: { invitationId: string } };
    expect(handlerResult.ok).toBe(true);

    const invitationId = handlerResult.data.invitationId;
    expect(typeof invitationId).toBe('string');

    // DB に pending 行が存在する
    const [row] = await db
      .select()
      .from(companyUserInvitation)
      .where(
        and(
          eq(companyUserInvitation.companyId, testCompanyId),
          eq(companyUserInvitation.email, email),
        ),
      )
      .limit(1);

    expect(row).toBeDefined();
    expect(row?.status).toBe('pending');
    expect(row?.roleInOrg).toBe('member');

    // sendEmail が呼ばれ、url にトークンが含まれる
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const callArgs = mockSendEmail.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(callArgs.to).toBe(email);
    // url に token が含まれていること
    const token = row?.token;
    expect(callArgs.html).toContain(token);
    expect(callArgs.text).toContain(token);

    // クリーンアップ
    await db.delete(companyUserInvitation).where(eq(companyUserInvitation.id, invitationId));
  });

  // -----------------------------------------------------------------------
  // (2) 非 active 会社への招待 → COMPANY_INACTIVE
  // -----------------------------------------------------------------------
  it('(2) 非 active 会社: COMPANY_INACTIVE を返す', async () => {
    const { createCompanyInvitation } = await import('./create-company-invitation');

    const suspendedCompanyId = await seedCompany('suspended');

    try {
      const outerResult = await createCompanyInvitation({
        companyId: suspendedCompanyId,
        email: `invite-inactive-${shortId()}@example.com`,
        roleInOrg: 'member',
      });

      const domainError = extractDomainError(
        outerResult as { ok: boolean; data?: unknown; error?: unknown },
      );
      expect(domainError).not.toBeNull();
      expect(domainError?.error.code).toBe('COMPANY_INACTIVE');
    } finally {
      await db.delete(company).where(eq(company.id, suspendedCompanyId));
    }

    // sendEmail は呼ばれない
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // (3) 既に会社所属済みのユーザーへの招待 → ALREADY_MEMBER
  // -----------------------------------------------------------------------
  it('(3) 既に会社所属済みユーザー: ALREADY_MEMBER を返す', async () => {
    const { createCompanyInvitation } = await import('./create-company-invitation');

    // existingMemberUserId のメールアドレスを取得
    const [memberUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, existingMemberUserId))
      .limit(1);

    expect(memberUser).toBeDefined();
    const memberEmail = memberUser!.email;

    const outerResult = await createCompanyInvitation({
      companyId: testCompanyId,
      email: memberEmail,
      roleInOrg: 'admin',
    });

    const domainError = extractDomainError(
      outerResult as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('ALREADY_MEMBER');

    // sendEmail は呼ばれない
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // (4) 同一会社×同一メールの pending 招待が既存 → ALREADY_INVITED
  // -----------------------------------------------------------------------
  it('(4) pending 重複: ALREADY_INVITED を返す', async () => {
    const { createCompanyInvitation } = await import('./create-company-invitation');

    const email = `invite-dup-${shortId()}@example.com`;

    // 1 回目: 成功
    const firstOuter = await createCompanyInvitation({
      companyId: testCompanyId,
      email,
      roleInOrg: 'member',
    });
    expect(firstOuter.ok).toBe(true);
    if (!firstOuter.ok) throw new Error('Expected first wrapper ok=true');
    const firstHandler = firstOuter.data as { ok: true; data: { invitationId: string } };
    expect(firstHandler.ok).toBe(true);

    mockSendEmail.mockClear();

    // 2 回目: 重複 → ALREADY_INVITED
    const secondOuter = await createCompanyInvitation({
      companyId: testCompanyId,
      email,
      roleInOrg: 'member',
    });

    const domainError = extractDomainError(
      secondOuter as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('ALREADY_INVITED');

    // sendEmail は 2 回目では呼ばれない
    expect(mockSendEmail).not.toHaveBeenCalled();

    // クリーンアップ
    await db
      .delete(companyUserInvitation)
      .where(eq(companyUserInvitation.id, firstHandler.data.invitationId));
  });
});

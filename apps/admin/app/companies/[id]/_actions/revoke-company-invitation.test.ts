/**
 * revokeCompanyInvitation の DB バックド統合テスト
 *
 * 呼び出し規約:
 *   - adminAction は `Result<HandlerReturn>` を返す
 *     - 認証/Zod エラー → { ok: false, error: { code, message } }
 *     - それ以外 → { ok: true, data: HandlerReturn }
 *   - ハンドラ内のドメインエラーは HandlerReturn として { ok: false, error } を返すため、
 *     呼び出し側では result.ok && result.data.ok の 2 段確認が必要
 *
 * Requirements: 3.3, 3.5, 6.1
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。
// vitest Node 環境では空モックに置換する。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// @bulr/auth/server のモック
// - adminAction: 実際の認証をスキップし、固定 ctx でハンドラを呼ぶパススルー実装
// ---------------------------------------------------------------------------

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
  };
});

// next/cache の revalidatePath はテスト環境では不要なためスタブ化
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { company, companyUserInvitation, user } from '@bulr/db/schema';
import { nanoid } from 'nanoid';

/** テスト用のランダム短縮 ID を返す */
function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// テスト用の固定 admin ユーザー ID
const TEST_ADMIN_USER_ID = 'admin-revoke-test-' + shortId();

// DB が使用可能かどうかの guard
const DB_AVAILABLE = !!process.env.DATABASE_URL;

/** テスト用会社を挿入するヘルパー */
async function seedCompany(): Promise<string> {
  const id = shortId();
  await db.insert(company).values({
    id,
    name: `テスト会社 ${id.slice(0, 6)}`,
    status: 'active',
    isActive: true,
  });
  return id;
}

/** テスト用 admin user を挿入するヘルパー */
async function seedAdminUser(): Promise<void> {
  await db
    .insert(user)
    .values({
      id: TEST_ADMIN_USER_ID,
      email: 'admin-revoke@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

/** テスト用招待レコードを挿入するヘルパー */
async function seedInvitation(
  companyId: string,
  status: 'pending' | 'accepted' | 'revoked' = 'pending',
): Promise<string> {
  const id = nanoid();
  const email = `invitee-${shortId()}@example.com`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(companyUserInvitation).values({
    id,
    companyId,
    email,
    roleInOrg: 'member',
    token: nanoid(),
    status,
    invitedByUserId: TEST_ADMIN_USER_ID,
    expiresAt,
  });

  return id;
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

describe.skipIf(!DB_AVAILABLE)('revokeCompanyInvitation integration', () => {
  let testCompanyId: string;

  beforeAll(async () => {
    await seedAdminUser();
    testCompanyId = await seedCompany();
  });

  afterAll(async () => {
    // 招待レコードをクリーンアップ
    await db
      .delete(companyUserInvitation)
      .where(eq(companyUserInvitation.companyId, testCompanyId));
    // 会社クリーンアップ
    await db.delete(company).where(eq(company.id, testCompanyId));
    // admin user クリーンアップ
    await db.delete(user).where(eq(user.id, TEST_ADMIN_USER_ID));
  });

  // -----------------------------------------------------------------------
  // (1) pending 招待を取り消す → status が 'revoked' になる
  // -----------------------------------------------------------------------
  it('(1) 正常: pending 招待を取り消すと DB の status が revoked になる', async () => {
    const { revokeCompanyInvitation } = await import('./revoke-company-invitation');

    const invitationId = await seedInvitation(testCompanyId, 'pending');

    const outerResult = await revokeCompanyInvitation({ invitationId });

    // adminAction wrapper は ok:true を返す
    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) throw new Error('Expected wrapper ok=true');

    // ハンドラ result は { ok: true, data: { ok: true } }
    const handlerResult = outerResult.data as { ok: boolean };
    expect(handlerResult.ok).toBe(true);

    // DB の status が revoked に変わっている
    const [row] = await db
      .select({ status: companyUserInvitation.status })
      .from(companyUserInvitation)
      .where(eq(companyUserInvitation.id, invitationId))
      .limit(1);

    expect(row).toBeDefined();
    expect(row?.status).toBe('revoked');
  });

  // -----------------------------------------------------------------------
  // (2) 既に revoked の招待を再取り消し → NOT_PENDING でステータス変化なし
  // -----------------------------------------------------------------------
  it('(2) 取消済み招待: NOT_PENDING を返し status は変化しない', async () => {
    const { revokeCompanyInvitation } = await import('./revoke-company-invitation');

    const invitationId = await seedInvitation(testCompanyId, 'revoked');

    const outerResult = await revokeCompanyInvitation({ invitationId });

    const domainError = extractDomainError(
      outerResult as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('NOT_PENDING');

    // DB の status は変わっていない
    const [row] = await db
      .select({ status: companyUserInvitation.status })
      .from(companyUserInvitation)
      .where(eq(companyUserInvitation.id, invitationId))
      .limit(1);

    expect(row?.status).toBe('revoked');
  });

  // -----------------------------------------------------------------------
  // (3) 存在しない招待 ID → NOT_FOUND
  // -----------------------------------------------------------------------
  it('(3) 存在しない招待 ID: NOT_FOUND を返す', async () => {
    const { revokeCompanyInvitation } = await import('./revoke-company-invitation');

    const nonExistentId = 'non-existent-id-' + shortId();

    const outerResult = await revokeCompanyInvitation({ invitationId: nonExistentId });

    const domainError = extractDomainError(
      outerResult as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('NOT_FOUND');
  });
});

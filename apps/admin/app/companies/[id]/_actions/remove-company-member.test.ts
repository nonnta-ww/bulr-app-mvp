/**
 * removeCompanyMember の DB バックド統合テスト
 *
 * 呼び出し規約:
 *   - adminAction は `Result<HandlerReturn>` を返す
 *     - 認証/Zod エラー → { ok: false, error: { code, message } }
 *     - それ以外 → { ok: true, data: HandlerReturn }
 *   - ハンドラ内のドメインエラーは HandlerReturn として { ok: false, error } を返すため、
 *     呼び出し側では result.ok && result.data.ok の 2 段確認が必要
 *
 * Requirements: 3.2, 3.4, 3.5, 6.1
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
import { company, opening, user, userProfile } from '@bulr/db/schema';
import { nanoid } from 'nanoid';

/** テスト用のランダム短縮 ID を返す */
function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// テスト用の固定 admin ユーザー ID
const TEST_ADMIN_USER_ID = 'admin-remove-test-' + shortId();

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
      email: `admin-remove-${shortId()}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

/** テスト用企業ユーザーを挿入するヘルパー */
async function seedUser(suffix: string): Promise<string> {
  const id = 'test-user-rm-' + suffix;
  await db
    .insert(user)
    .values({
      id,
      email: `user-${suffix}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
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

describe.skipIf(!DB_AVAILABLE)('removeCompanyMember integration', () => {
  let testCompanyId: string;
  const seededUserIds: string[] = [];
  const seededOpeningIds: string[] = [];

  beforeAll(async () => {
    await seedAdminUser();
    testCompanyId = await seedCompany();
  });

  afterAll(async () => {
    // opening クリーンアップ
    for (const openingId of seededOpeningIds) {
      await db.delete(opening).where(eq(opening.id, openingId));
    }
    // user_profile → user クリーンアップ
    for (const userId of seededUserIds) {
      await db.delete(userProfile).where(eq(userProfile.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
    }
    // 会社クリーンアップ
    await db.delete(company).where(eq(company.id, testCompanyId));
    // admin user クリーンアップ
    await db.delete(userProfile).where(eq(userProfile.userId, TEST_ADMIN_USER_ID));
    await db.delete(user).where(eq(user.id, TEST_ADMIN_USER_ID));
  });

  // -----------------------------------------------------------------------
  // (1) 正常: メンバーを解除すると company_id と role_in_org が NULL になる。
  //     かつ、そのユーザーが持つ opening は削除されず残存する（Req 3.4）。
  // -----------------------------------------------------------------------
  it('(1) 正常: メンバーを解除すると user_profile.company_id / role_in_org が NULL になり、既存 opening は残存する', async () => {
    const { removeCompanyMember } = await import('./remove-company-member');

    const suffix = shortId();
    const userId = await seedUser(suffix);
    seededUserIds.push(userId);

    // user_profile に companyId と roleInOrg を設定してメンバーとして挿入
    await db.insert(userProfile).values({
      userId,
      companyId: testCompanyId,
      displayName: `テストユーザー ${suffix}`,
      roleInOrg: 'member',
    });

    // 既存データ: このユーザーが属する会社の opening を作成（Req 3.4 検証用）
    const openingId = nanoid();
    seededOpeningIds.push(openingId);
    await db.insert(opening).values({
      id: openingId,
      companyId: testCompanyId,
      title: `テスト求人 ${suffix}`,
      status: 'draft',
    });

    // 解除アクションを実行
    const outerResult = await removeCompanyMember({
      companyId: testCompanyId,
      userId,
    });

    // adminAction wrapper は ok:true を返す
    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) throw new Error('Expected wrapper ok=true');

    // ハンドラ result は { ok: true, data: { ok: true } }
    const handlerResult = outerResult.data as { ok: boolean };
    expect(handlerResult.ok).toBe(true);

    // user_profile.company_id が NULL になっている
    const [profile] = await db
      .select({ companyId: userProfile.companyId, roleInOrg: userProfile.roleInOrg })
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);

    expect(profile).toBeDefined();
    expect(profile?.companyId).toBeNull();
    expect(profile?.roleInOrg).toBeNull();

    // opening は削除されずに残存している（Req 3.4）
    const [existingOpening] = await db
      .select({ id: opening.id })
      .from(opening)
      .where(eq(opening.id, openingId))
      .limit(1);

    expect(existingOpening).toBeDefined();
    expect(existingOpening?.id).toBe(openingId);
  });

  // -----------------------------------------------------------------------
  // (2) ミスマッチ: userId の user_profile.company_id が異なる会社（または NULL）の場合
  //     → NOT_FOUND を返し、profile は変化しない（Req 3.2）
  // -----------------------------------------------------------------------
  it('(2) ミスマッチ: userId が別会社のメンバーの場合は NOT_FOUND を返す', async () => {
    const { removeCompanyMember } = await import('./remove-company-member');

    const suffix = shortId();
    const userId = await seedUser(suffix);
    seededUserIds.push(userId);

    // user_profile を別の companyId で挿入（testCompanyId ではない）
    const otherCompanyId = 'other-company-' + shortId();
    await db.insert(company).values({
      id: otherCompanyId,
      name: `別会社 ${shortId()}`,
      status: 'active',
      isActive: true,
    });
    await db.insert(userProfile).values({
      userId,
      companyId: otherCompanyId, // 別会社に所属
      displayName: `別会社ユーザー ${suffix}`,
      roleInOrg: 'member',
    });

    // testCompanyId でメンバー解除しようとする（ミスマッチ）
    const outerResult = await removeCompanyMember({
      companyId: testCompanyId,
      userId,
    });

    const domainError = extractDomainError(
      outerResult as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('NOT_FOUND');

    // user_profile は変化していない（otherCompanyId のまま）
    const [profile] = await db
      .select({ companyId: userProfile.companyId, roleInOrg: userProfile.roleInOrg })
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);

    expect(profile?.companyId).toBe(otherCompanyId);
    expect(profile?.roleInOrg).toBe('member');

    // クリーンアップ: 別会社レコードを後始末
    await db.delete(userProfile).where(eq(userProfile.userId, userId));
    seededUserIds.pop(); // afterAll での重複削除を避けるため除去
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(company).where(eq(company.id, otherCompanyId));
  });
});

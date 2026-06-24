/**
 * setCompanyStatus の純粋単体テスト + DB バックド統合テスト
 *
 * 呼び出し規約:
 *   - adminAction は `Result<HandlerReturn>` を返す
 *     - 認証/Zod エラー → { ok: false, error: { code, message } }
 *     - それ以外 → { ok: true, data: HandlerReturn }
 *   - ハンドラ内のドメインエラーは HandlerReturn として { ok: false, error } を返すため、
 *     呼び出し側では result.ok && result.data.ok の 2 段確認が必要
 *
 * Requirements: 4.2, 4.3, 4.4, 4.7
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
import { company, user } from '@bulr/db/schema';

/** テスト用のランダム短縮 ID を返す */
function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// テスト用の固定 admin ユーザー ID（モック ctx.userId と一致）
const TEST_ADMIN_USER_ID = 'admin-status-test-' + shortId();

// DB が使用可能かどうかの guard
const DB_AVAILABLE = !!process.env.DATABASE_URL;

/** テスト用会社を挿入するヘルパー */
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
 * アクションの結果からドメインエラーを取り出すヘルパー。
 * adminAction は常に { ok: true, data: HandlerReturn } を返す（認証エラー以外）。
 * ハンドラ内ドメインエラーは HandlerReturn が { ok: false, error } 形式。
 */
function extractDomainError(
  result: { ok: boolean; data?: unknown; error?: unknown },
): { ok: false; error: { code: string; message: string } } | null {
  if (!result.ok) {
    return result as { ok: false; error: { code: string; message: string } };
  }
  const data = result.data as { ok?: boolean; error?: { code: string; message: string } };
  if (data && data.ok === false) {
    return { ok: false, error: data.error! };
  }
  return null;
}

// ===========================================================================
// 純粋単体テスト: isAllowedCompanyTransition の遷移マトリックス
// ===========================================================================

describe('isAllowedCompanyTransition (pure unit)', () => {
  it('allows active → suspended', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('active', 'suspended')).toBe(true);
  });

  it('allows active → terminated', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('active', 'terminated')).toBe(true);
  });

  it('allows suspended → active', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('suspended', 'active')).toBe(true);
  });

  it('allows suspended → terminated', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('suspended', 'terminated')).toBe(true);
  });

  it('rejects terminated → active (terminated is terminal)', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('terminated', 'active')).toBe(false);
  });

  it('rejects terminated → suspended (terminated is terminal)', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('terminated', 'suspended')).toBe(false);
  });

  it('rejects active → active (same-state no-op)', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('active', 'active')).toBe(false);
  });

  it('rejects suspended → suspended (same-state no-op)', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('suspended', 'suspended')).toBe(false);
  });

  it('rejects terminated → terminated (same-state no-op from terminal)', async () => {
    const { isAllowedCompanyTransition } = await import('./company-status-transitions');
    expect(isAllowedCompanyTransition('terminated', 'terminated')).toBe(false);
  });
});

// ===========================================================================
// DB バックド統合テスト: setCompanyStatus のハッピーパスとエラーパス
// ===========================================================================

describe.skipIf(!DB_AVAILABLE)('setCompanyStatus integration', () => {
  let testCompanyId: string;

  beforeAll(async () => {
    // admin user を挿入（FK 制約のため adminAction モックの ctx.userId が存在する必要あり）
    await db
      .insert(user)
      .values({
        id: TEST_ADMIN_USER_ID,
        email: `admin-status-${shortId()}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    testCompanyId = await seedCompany('active');
  });

  afterAll(async () => {
    // 会社クリーンアップ
    await db.delete(company).where(eq(company.id, testCompanyId));
    // admin user クリーンアップ（userProfile は未作成なのでスキップ）
    await db.delete(user).where(eq(user.id, TEST_ADMIN_USER_ID));
  });

  // -----------------------------------------------------------------------
  // (1) active → suspended: status='suspended', is_active=false
  // -----------------------------------------------------------------------
  it('(1) active → suspended: status と is_active が正しく更新される (Req 4.2)', async () => {
    const { setCompanyStatus } = await import('./set-company-status');

    const outerResult = await setCompanyStatus({
      companyId: testCompanyId,
      status: 'suspended',
    });

    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) throw new Error('Expected wrapper ok=true');

    const handlerResult = outerResult.data as { ok: boolean };
    expect(handlerResult.ok).toBe(true);

    // DB 確認
    const [row] = await db
      .select({ status: company.status, isActive: company.isActive })
      .from(company)
      .where(eq(company.id, testCompanyId))
      .limit(1);

    expect(row).toBeDefined();
    expect(row?.status).toBe('suspended');
    expect(row?.isActive).toBe(false);
  });

  // -----------------------------------------------------------------------
  // (2) suspended → active: status='active', is_active=true (Req 4.4 reactivate)
  // -----------------------------------------------------------------------
  it('(2) suspended → active: ステータスが回復し is_active=true になる (Req 4.4)', async () => {
    const { setCompanyStatus } = await import('./set-company-status');

    // 現在 suspended のはず（前テストで更新済み）
    const outerResult = await setCompanyStatus({
      companyId: testCompanyId,
      status: 'active',
    });

    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) throw new Error('Expected wrapper ok=true');

    const handlerResult = outerResult.data as { ok: boolean };
    expect(handlerResult.ok).toBe(true);

    // DB 確認
    const [row] = await db
      .select({ status: company.status, isActive: company.isActive })
      .from(company)
      .where(eq(company.id, testCompanyId))
      .limit(1);

    expect(row?.status).toBe('active');
    expect(row?.isActive).toBe(true);
  });

  // -----------------------------------------------------------------------
  // (3) active → terminated: status='terminated', is_active=false (Req 4.3)
  // -----------------------------------------------------------------------
  it('(3) active → terminated: status と is_active が正しく更新される (Req 4.3)', async () => {
    const { setCompanyStatus } = await import('./set-company-status');

    // 現在 active のはず（前テストで回復済み）
    const outerResult = await setCompanyStatus({
      companyId: testCompanyId,
      status: 'terminated',
    });

    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) throw new Error('Expected wrapper ok=true');

    const handlerResult = outerResult.data as { ok: boolean };
    expect(handlerResult.ok).toBe(true);

    // DB 確認
    const [row] = await db
      .select({ status: company.status, isActive: company.isActive })
      .from(company)
      .where(eq(company.id, testCompanyId))
      .limit(1);

    expect(row?.status).toBe('terminated');
    expect(row?.isActive).toBe(false);
  });

  // -----------------------------------------------------------------------
  // (4) terminated → active: INVALID_TRANSITION を返し、行は変化しない (Req 4.4 / terminated は終端)
  // -----------------------------------------------------------------------
  it('(4) terminated → active: INVALID_TRANSITION を返し行が変化しない', async () => {
    const { setCompanyStatus } = await import('./set-company-status');

    // 現在 terminated のはず（前テストで更新済み）
    const outerResult = await setCompanyStatus({
      companyId: testCompanyId,
      status: 'active',
    });

    const domainError = extractDomainError(
      outerResult as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('INVALID_TRANSITION');

    // 行は変化していない（terminated のまま）
    const [row] = await db
      .select({ status: company.status, isActive: company.isActive })
      .from(company)
      .where(eq(company.id, testCompanyId))
      .limit(1);

    expect(row?.status).toBe('terminated');
    expect(row?.isActive).toBe(false);
  });

  // -----------------------------------------------------------------------
  // (5) 存在しない会社 ID → NOT_FOUND
  // -----------------------------------------------------------------------
  it('(5) 存在しない会社 ID: NOT_FOUND を返す', async () => {
    const { setCompanyStatus } = await import('./set-company-status');

    const outerResult = await setCompanyStatus({
      companyId: 'nonexistent-company-id',
      status: 'suspended',
    });

    const domainError = extractDomainError(
      outerResult as { ok: boolean; data?: unknown; error?: unknown },
    );
    expect(domainError).not.toBeNull();
    expect(domainError?.error.code).toBe('NOT_FOUND');
  });
});

// ===========================================================================
// DB バックド統合テスト: disable-company の status 同期確認
// ===========================================================================

describe.skipIf(!DB_AVAILABLE)('disableCompany legacy action - status sync', () => {
  let disableTestCompanyId: string;

  beforeAll(async () => {
    disableTestCompanyId = await seedCompany('active');
  });

  afterAll(async () => {
    await db.delete(company).where(eq(company.id, disableTestCompanyId));
  });

  it('disableCompany が status="suspended" かつ is_active=false を設定する（ゲートが機能する）', async () => {
    const { disableCompany } = await import('../../_actions/disable-company');

    const outerResult = await disableCompany({ companyId: disableTestCompanyId });

    // wrapper は ok:true を返す
    expect(outerResult.ok).toBe(true);

    // DB で status と is_active を確認
    const [row] = await db
      .select({ status: company.status, isActive: company.isActive })
      .from(company)
      .where(eq(company.id, disableTestCompanyId))
      .limit(1);

    expect(row).toBeDefined();
    // 修正後: status='suspended' でゲートが実際に機能する
    expect(row?.status).toBe('suspended');
    expect(row?.isActive).toBe(false);
  });
});

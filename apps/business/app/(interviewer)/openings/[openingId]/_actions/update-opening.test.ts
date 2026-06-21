/**
 * updateOpening Server Action の統合テスト（DB バックド）。
 *
 * - `@bulr/auth/server` の authedAction を passthrough モックに置換（Cookie 不要）
 * - requireCompanyUser は vi.hoisted のモック fn で companyId を制御
 * - next/cache・next/navigation は副作用を spy 化
 * - opening の更新・所有権検証は実際の Docker Postgres に対して行う
 *
 * Design: docs/superpowers/specs/2026-06-21-opening-edit-design.md
 */

// server-only は vitest Node 環境で空モジュールに置換する
vi.mock('server-only', () => ({}));

// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
const { mockRequireCompanyUser } = vi.hoisted(() => ({
  mockRequireCompanyUser: vi.fn<() => Promise<{ companyId: string }>>(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

/**
 * @bulr/auth/server のモック。
 * - authedAction を safeParse + 固定 ctx passthrough に差し替える（実 authedAction と同じ境界動作）。
 * - requireCompanyUser はテストから制御可能なモック fn。
 * - AuthError は実装互換のクラス。
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
          userId: 'update-opening-test-user',
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

  return { authedAction, requireCompanyUser: mockRequireCompanyUser, AuthError };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, schema } from '@bulr/db';
import { nanoid } from 'nanoid';

import { updateOpening } from './update-opening';

const OWNER_COMPANY_ID = 'update-opening-owner-company';
const OTHER_COMPANY_ID = 'update-opening-other-company';

async function readOpening(id: string) {
  return db.query.opening.findFirst({ where: eq(schema.opening.id, id) });
}

describe('updateOpening Server Action', () => {
  let openingId: string;

  beforeEach(async () => {
    openingId = nanoid();
    mockRequireCompanyUser.mockReset();
    mockRequireCompanyUser.mockResolvedValue({ companyId: OWNER_COMPANY_ID });

    await db.insert(schema.company).values([
      { id: OWNER_COMPANY_ID, name: 'Owner Co' },
      { id: OTHER_COMPANY_ID, name: 'Other Co' },
    ]);
    await db.insert(schema.opening).values({
      id: openingId,
      companyId: OWNER_COMPANY_ID,
      title: '旧タイトル',
      description: '旧説明',
      status: 'draft',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await db.delete(schema.opening).where(eq(schema.opening.companyId, OWNER_COMPANY_ID));
    await db.delete(schema.opening).where(eq(schema.opening.companyId, OTHER_COMPANY_ID));
    await db.delete(schema.company).where(eq(schema.company.id, OWNER_COMPANY_ID));
    await db.delete(schema.company).where(eq(schema.company.id, OTHER_COMPANY_ID));
  });

  it('自社の opening の title/description/status を更新し詳細へリダイレクトする', async () => {
    const before = await readOpening(openingId);

    const result = await updateOpening({
      openingId,
      title: '新タイトル',
      description: '新説明',
      status: 'open',
    });

    expect(result.ok).toBe(true);

    const after = await readOpening(openingId);
    expect(after?.title).toBe('新タイトル');
    expect(after?.description).toBe('新説明');
    expect(after?.status).toBe('open');
    // updatedAt が前進している
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());

    expect(redirect).toHaveBeenCalledWith(`/openings/${openingId}`);
  });

  it('他社の opening は更新を拒否し DB を変更しない', async () => {
    const otherOpeningId = nanoid();
    await db.insert(schema.opening).values({
      id: otherOpeningId,
      companyId: OTHER_COMPANY_ID,
      title: '他社タイトル',
      description: '他社説明',
      status: 'draft',
    });

    // 呼び出し元は OWNER だが他社 opening を編集しようとする
    const result = await updateOpening({
      openingId: otherOpeningId,
      title: '乗っ取り',
      description: 'x',
      status: 'open',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');

    const untouched = await readOpening(otherOpeningId);
    expect(untouched?.title).toBe('他社タイトル');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('存在しない opening は拒否する', async () => {
    const result = await updateOpening({
      openingId: 'does-not-exist',
      title: 'タイトル',
      description: '',
      status: 'open',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    expect(redirect).not.toHaveBeenCalled();
  });
});

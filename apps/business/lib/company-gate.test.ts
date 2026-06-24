/**
 * requireCompanyGate のユニットテスト
 *
 * company-user-invitation Requirements: 5.1, 5.2, 6.2
 * design.md: requireCompanyGate（apps/business/lib/company-gate.ts）
 *
 * テスト戦略:
 * - server-only をモックして Node テスト環境で実行できるようにする
 * - @bulr/auth/server の requireCompanyUser をモックして制御可能にする
 * - next/navigation の redirect をモックして sentinel エラーを throw させる
 * - AuthError はモック内で実クラスに近い形で再現する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// server-only モック（Node テスト環境で import エラーを回避）
vi.mock('server-only', () => ({}));

// next/navigation の redirect をモック: redirect('/path') → throw Error('REDIRECT:/path')
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

// @bulr/auth/server をモック
// AuthError クラスは code プロパティを持つ実クラスに近い形で再現
vi.mock('@bulr/auth/server', () => {
  class MockAuthError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = 'AuthError';
      this.code = code;
    }
  }

  return {
    requireCompanyUser: vi.fn(),
    AuthError: MockAuthError,
  };
});

// モジュールのインポートはモック宣言の後に行う
import { requireCompanyGate } from './company-gate';
import { requireCompanyUser, AuthError } from '@bulr/auth/server';

const mockRequireCompanyUser = vi.mocked(requireCompanyUser);

describe('requireCompanyGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功時: requireCompanyUser が {companyId:"c1",...} を返すと { companyId:"c1" } を返す', async () => {
    mockRequireCompanyUser.mockResolvedValueOnce({
      user: { id: 'u1', email: 'test@example.com', name: null, image: null, emailVerified: false, createdAt: new Date(), updatedAt: new Date() },
      companyId: 'c1',
      companyStatus: 'active',
    });

    const result = await requireCompanyGate();

    expect(result).toEqual({ companyId: 'c1' });
  });

  it('UNAUTHORIZED → redirect("/sign-in") を throw する', async () => {
    mockRequireCompanyUser.mockRejectedValueOnce(new AuthError('UNAUTHORIZED'));

    await expect(requireCompanyGate()).rejects.toThrow('REDIRECT:/sign-in');
  });

  it('SESSION_EXPIRED → redirect("/sign-in") を throw する', async () => {
    mockRequireCompanyUser.mockRejectedValueOnce(new AuthError('SESSION_EXPIRED'));

    await expect(requireCompanyGate()).rejects.toThrow('REDIRECT:/sign-in');
  });

  it('COMPANY_NOT_ASSOCIATED → redirect("/no-company") を throw する', async () => {
    mockRequireCompanyUser.mockRejectedValueOnce(new AuthError('COMPANY_NOT_ASSOCIATED'));

    await expect(requireCompanyGate()).rejects.toThrow('REDIRECT:/no-company');
  });

  it('COMPANY_INACTIVE → redirect("/no-company") を throw する', async () => {
    mockRequireCompanyUser.mockRejectedValueOnce(new AuthError('COMPANY_INACTIVE'));

    await expect(requireCompanyGate()).rejects.toThrow('REDIRECT:/no-company');
  });

  it('その他の AuthError コード → rethrow する（sentinel ではなく元のエラーが伝播する）', async () => {
    const unknownError = new AuthError('FORBIDDEN');
    mockRequireCompanyUser.mockRejectedValueOnce(unknownError);

    await expect(requireCompanyGate()).rejects.toThrow(unknownError);
  });

  it('非 AuthError → rethrow する', async () => {
    const unexpected = new Error('unexpected DB error');
    mockRequireCompanyUser.mockRejectedValueOnce(unexpected);

    await expect(requireCompanyGate()).rejects.toThrow(unexpected);
  });
});

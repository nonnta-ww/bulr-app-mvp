/**
 * guards.ts のユニットテスト
 *
 * resolveCompanyAccess の純粋な分岐ロジックを網羅する。
 * DB / Next.js ヘッダーへの依存は不要（helpers は同期関数）。
 *
 * Task 2.1: 会社ゲートにステータス判定を追加する
 * Requirements: 4.2, 4.3, 5.2, 6.1, 6.2
 */

import { describe, it, expect } from 'vitest';
import { resolveCompanyAccess } from './guards';
import { AuthError } from './errors';

describe('resolveCompanyAccess', () => {
  // ----------------------------------------------------------------
  // ブランチ 1: companyId が null → COMPANY_NOT_ASSOCIATED
  // ----------------------------------------------------------------
  it('companyId が null のとき COMPANY_NOT_ASSOCIATED を throw する', () => {
    expect(() =>
      resolveCompanyAccess({ companyId: null, companyStatus: null }),
    ).toThrow(AuthError);

    try {
      resolveCompanyAccess({ companyId: null, companyStatus: null });
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('COMPANY_NOT_ASSOCIATED');
    }
  });

  // ----------------------------------------------------------------
  // ブランチ 2: companyId が undefined → COMPANY_NOT_ASSOCIATED
  // ----------------------------------------------------------------
  it('companyId が undefined のとき COMPANY_NOT_ASSOCIATED を throw する', () => {
    expect(() =>
      resolveCompanyAccess({ companyId: undefined, companyStatus: undefined }),
    ).toThrow(AuthError);
    try {
      resolveCompanyAccess({ companyId: undefined, companyStatus: undefined });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('COMPANY_NOT_ASSOCIATED');
    }
  });

  // ----------------------------------------------------------------
  // ブランチ 3: company 行が存在しない（companyStatus null）→ COMPANY_NOT_ASSOCIATED
  // ----------------------------------------------------------------
  it('companyId が設定済みでも companyStatus が null（会社行なし）のとき COMPANY_NOT_ASSOCIATED を throw する', () => {
    expect(() =>
      resolveCompanyAccess({ companyId: 'company-abc', companyStatus: null }),
    ).toThrow(AuthError);
    try {
      resolveCompanyAccess({ companyId: 'company-abc', companyStatus: null });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('COMPANY_NOT_ASSOCIATED');
    }
  });

  // ----------------------------------------------------------------
  // ブランチ 4: status が suspended → COMPANY_INACTIVE
  // ----------------------------------------------------------------
  it("companyStatus が 'suspended' のとき COMPANY_INACTIVE を throw する", () => {
    expect(() =>
      resolveCompanyAccess({ companyId: 'company-abc', companyStatus: 'suspended' }),
    ).toThrow(AuthError);
    try {
      resolveCompanyAccess({ companyId: 'company-abc', companyStatus: 'suspended' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('COMPANY_INACTIVE');
    }
  });

  // ----------------------------------------------------------------
  // ブランチ 5: status が terminated → COMPANY_INACTIVE
  // ----------------------------------------------------------------
  it("companyStatus が 'terminated' のとき COMPANY_INACTIVE を throw する", () => {
    expect(() =>
      resolveCompanyAccess({ companyId: 'company-abc', companyStatus: 'terminated' }),
    ).toThrow(AuthError);
    try {
      resolveCompanyAccess({ companyId: 'company-abc', companyStatus: 'terminated' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('COMPANY_INACTIVE');
    }
  });

  // ----------------------------------------------------------------
  // ブランチ 6: 正常系 — companyId 設定済み かつ status=active → { companyId, companyStatus }
  // ----------------------------------------------------------------
  it("companyId が設定済みで companyStatus が 'active' のとき { companyId, companyStatus } を返す", () => {
    const result = resolveCompanyAccess({ companyId: 'company-abc', companyStatus: 'active' });
    expect(result).toEqual({ companyId: 'company-abc', companyStatus: 'active' });
  });

  // ----------------------------------------------------------------
  // 型チェック: 返り値の companyStatus が CompanyStatus 型 'active' であること
  // ----------------------------------------------------------------
  it('正常系の返り値 companyStatus は active である', () => {
    const result = resolveCompanyAccess({ companyId: 'company-xyz', companyStatus: 'active' });
    expect(result.companyStatus).toBe('active');
    expect(result.companyId).toBe('company-xyz');
  });
});

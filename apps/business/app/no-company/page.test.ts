/**
 * no-company — deriveNoCompanyState の単体テスト
 *
 * company-user-invitation Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * deriveNoCompanyState は no-company-state.ts に実装された純粋関数。
 * server-only 依存がないため vitest で直接テストできる。
 *
 * なお、page.tsx の Server Component 本体は requireUser()/DB/redirect など
 * 重いモックが必要なため render テストはスコープ外（CONCERNS 参照）。
 * E2E フローテストは task 7.3 で対応する。
 */

import { describe, expect, it } from 'vitest';
import { deriveNoCompanyState } from './no-company-state';

describe('deriveNoCompanyState', () => {
  it('companyId が null の場合は "unassociated" を返す（Req 5.1）', () => {
    expect(deriveNoCompanyState({ companyId: null, companyStatus: null })).toBe('unassociated');
  });

  it('companyId が null で companyStatus が "active" の場合も "unassociated" を返す（防御的）', () => {
    expect(deriveNoCompanyState({ companyId: null, companyStatus: 'active' })).toBe('unassociated');
  });

  it('companyId がセットされているが companyStatus が null の場合は "unassociated" を返す（防御的扱い）', () => {
    expect(deriveNoCompanyState({ companyId: 'company-123', companyStatus: null })).toBe(
      'unassociated',
    );
  });

  it('companyStatus が "suspended" の場合は "suspended" を返す（Req 5.2）', () => {
    expect(deriveNoCompanyState({ companyId: 'company-123', companyStatus: 'suspended' })).toBe(
      'suspended',
    );
  });

  it('companyStatus が "terminated" の場合は "terminated" を返す（Req 5.2）', () => {
    expect(deriveNoCompanyState({ companyId: 'company-123', companyStatus: 'terminated' })).toBe(
      'terminated',
    );
  });

  it('companyStatus が "active" の場合は "active" を返す（Req 5.5 → /openings へリダイレクト対象）', () => {
    expect(deriveNoCompanyState({ companyId: 'company-123', companyStatus: 'active' })).toBe(
      'active',
    );
  });
});

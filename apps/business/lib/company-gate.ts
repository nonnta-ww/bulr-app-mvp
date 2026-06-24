/**
 * 会社ゲート共通ヘルパー（apps/business/lib/company-gate.ts）
 *
 * 会社ゲート付きページから呼び出す共通ヘルパー。
 * requireCompanyUser() の AuthError を catch し、エラーコードに応じて
 * /sign-in または /no-company へ redirect する。
 *
 * redirect() は next/navigation の制御フロー throw であるため、
 * requireCompanyUser() の try/catch 内で呼び出し、redirect の throw を
 * 外側に伝播させる（catch ブロック内で呼ぶことで swallow されない）。
 *
 * company-user-invitation Requirements: 5.1, 5.2, 6.2
 * design.md: requireCompanyGate（apps/business/lib/company-gate.ts）
 * design.md: 会社ゲート分岐（Process）
 */

import 'server-only';

import { redirect } from 'next/navigation';

import { requireCompanyUser, AuthError } from '@bulr/auth/server';

/**
 * 会社ゲートページ共通ヘルパー。
 *
 * 内部で requireCompanyUser を呼び、AuthError を redirect にマップする。
 *   - UNAUTHORIZED / SESSION_EXPIRED → redirect('/sign-in')
 *   - COMPANY_NOT_ASSOCIATED / COMPANY_INACTIVE → redirect('/no-company')
 *   - その他の AuthError → rethrow（予期しないコードをサーフェスさせる）
 *   - 非 AuthError → rethrow
 *
 * @returns { companyId: string } - 認可成功時の会社 ID
 */
export async function requireCompanyGate(): Promise<{ companyId: string }> {
  let result: Awaited<ReturnType<typeof requireCompanyUser>>;

  try {
    result = await requireCompanyUser();
  } catch (e) {
    if (e instanceof AuthError) {
      const { code } = e;

      if (code === 'UNAUTHORIZED' || code === 'SESSION_EXPIRED') {
        redirect('/sign-in');
      }

      if (code === 'COMPANY_NOT_ASSOCIATED' || code === 'COMPANY_INACTIVE') {
        redirect('/no-company');
      }

      // その他の AuthError コード（FORBIDDEN 等）は rethrow して予期しないコードをサーフェスさせる
      throw e;
    }

    // 非 AuthError（DB エラー等）は rethrow
    throw e;
  }

  return { companyId: result.companyId };
}

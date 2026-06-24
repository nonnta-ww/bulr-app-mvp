/**
 * no-company ページで使う純粋なステート導出ヘルパー
 *
 * サーバー依存（server-only, DB, auth）を持たないため vitest で直接テストできる。
 *
 * company-user-invitation Requirements: 5.1, 5.2, 5.5
 */

import type { CompanyStatus } from '@bulr/db/schema';

/**
 * /no-company ページで表示すべき状態。
 *
 * - 'unassociated': 会社に未所属（Req 5.1）
 * - 'suspended':   所属会社が一時停止（Req 5.2）
 * - 'terminated':  所属会社が解約済み（Req 5.2）
 * - 'active':      正常所属 → ページ側で /openings にリダイレクト（Req 5.5）
 */
export type NoCompanyState = 'unassociated' | 'suspended' | 'terminated' | 'active';

/**
 * ユーザーの会社状態を導出する純粋関数。
 *
 * - companyId が null → 'unassociated'
 * - companyId はあるが companyStatus が null → 'unassociated'（防御的扱い）
 * - companyStatus 'suspended' → 'suspended'
 * - companyStatus 'terminated' → 'terminated'
 * - companyStatus 'active' → 'active'
 */
export function deriveNoCompanyState(input: {
  companyId: string | null;
  companyStatus: CompanyStatus | null;
}): NoCompanyState {
  const { companyId, companyStatus } = input;

  // companyId 未設定 → 未所属
  if (!companyId) {
    return 'unassociated';
  }

  // companyId はあるが会社行が取得できなかった場合 → 防御的に未所属扱い
  if (!companyStatus) {
    return 'unassociated';
  }

  // 会社ステータスに応じて状態を返す
  if (companyStatus === 'suspended') return 'suspended';
  if (companyStatus === 'terminated') return 'terminated';

  // 'active'（または将来の未知のステータス）
  return 'active';
}

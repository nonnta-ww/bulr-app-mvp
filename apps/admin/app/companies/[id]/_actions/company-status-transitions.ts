/**
 * 会社ステータス遷移の純粋ロジック（'use server' 非依存モジュール）
 *
 * `set-company-status.ts` は `'use server'` ファイルであり、async 関数（Server Action）
 * 以外を export できない。一方、この純粋関数はクライアントコンポーネント
 * （company-status-controls.tsx）でも遷移ボタンの出し分けに使うため、
 * 'use server' を持たない本モジュールに切り出して双方から import する。
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import type { CompanyStatus } from '@bulr/auth/server';

/**
 * 会社ステータス遷移の可否を判定する純粋関数。
 *
 * 許可エッジ（State Diagram より）:
 *   active → suspended
 *   active → terminated
 *   suspended → active
 *   suspended → terminated
 *
 * 禁止:
 *   terminated → * （終端状態）
 *   * → same   （同一ステータス no-op）
 */
export function isAllowedCompanyTransition(from: CompanyStatus, to: CompanyStatus): boolean {
  // 同一ステータスへの遷移は常に禁止
  if (from === to) return false;

  // terminated は終端状態: いかなる遷移も禁止
  if (from === 'terminated') return false;

  // 許可エッジ: active → suspended, active → terminated
  if (from === 'active' && (to === 'suspended' || to === 'terminated')) return true;

  // 許可エッジ: suspended → active, suspended → terminated
  if (from === 'suspended' && (to === 'active' || to === 'terminated')) return true;

  return false;
}

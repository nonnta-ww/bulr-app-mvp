/**
 * 認証エラー型（AuthError）
 *
 * packages/auth が公開するエラー判別共用体。Server Component / Server Action /
 * Route Handler で `throw new AuthError(code)` し、呼び出し側で `instanceof
 * AuthError` で捕捉してステータスコードに対応付ける。
 *
 * - `UNAUTHORIZED` / `FORBIDDEN` / `SESSION_EXPIRED` は design.md セクション7
 *   「Service Interface」が公開仕様として明記しているコード。
 * - `NOT_FOUND` は既存の `requireSessionOwnership` が DB 上にセッションが無い
 *   場合に投げてきた後方互換コード（design.md セクション9「Error Strategy」の
 *   "移管後も同じ挙動を維持する" 方針に従い保持）。
 * - `COMPANY_NOT_ASSOCIATED` は `requireCompanyUser()` が `user_profile.company_id`
 *   未設定の場合に投げるコード。
 * - `COMPANY_INACTIVE` は `requireCompanyUser()` が所属会社のステータスが 'active'
 *   以外（suspended / terminated）の場合に投げるコード（design.md
 *   「requireCompanyUser（modified） / COMPANY_INACTIVE」）。
 *
 * Requirements: 5.4, 5.5, 5.2, 6.1, 6.2
 */

export type AuthErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SESSION_EXPIRED'
  | 'NOT_FOUND'
  | 'CANDIDATE_PROFILE_MISSING'
  | 'COMPANY_NOT_ASSOCIATED'
  | 'COMPANY_INACTIVE';

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

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
 *
 * Requirements: 5.4, 5.5
 */

export type AuthErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SESSION_EXPIRED'
  | 'NOT_FOUND'
  | 'CANDIDATE_PROFILE_MISSING'
  | 'COMPANY_NOT_ASSOCIATED';

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

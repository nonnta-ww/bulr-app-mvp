/**
 * @bulr/auth/server — Server 専用エントリ
 *
 * Server Component / Server Action / Route Handler から import する。
 * Client Component から import すると Next.js のビルドで `next/headers`・
 * `pg`・`nodemailer` 等の server-only 依存が Client バンドルに巻き込まれて
 * 失敗するため、Client Component では `@bulr/auth/client` を使うこと。
 *
 * `import 'server-only';` は本エントリが import する各 module（server.ts /
 * guards.ts / safe-action.ts）の冒頭で宣言済み。Client から誤って import
 * された場合は明示的な build エラーになる。
 *
 * Requirements: 5.1, 5.4, 5.6, 5.7, 5.8, 5.10, 5.11
 */

// createAuth factory（各アプリは lib/auth.ts で呼び出し、独自の auth インスタンスを生成する）
// candidate-auth-onboarding Requirements: 1.1, 1.3
export { createAuth } from './server';
export type { CreateAuthConfig, SendMagicLinkFn } from './server';

// 認証ガード（Server Component / Server Action / Route Handler の先頭で呼ぶ）
// candidate-auth-onboarding Requirements: 7.1, 7.4
export {
  getCurrentUser,
  requireUser,
  requireAdmin,
  requireSessionOwnership,
  requireCandidate,
  requireCompanyUser,
} from './guards';

// Server Action ラッパー（型安全な認可付き Server Action を提供）
export { authedAction, adminAction, candidateAction, ActionError } from './safe-action';
export type { Result, ActionErrorPayload } from './safe-action';

// メール送信ユーティリティ（sendMagicLink 実装を各アプリが自前で用意する際に使用）
// candidate-auth-onboarding Requirements: 2.2, 8.2
export { sendEmail } from './email/resend';

// エラー型（isomorphic だが server 側でも参照しやすいよう再エクスポート）
export { AuthError } from './errors';
export type { AuthErrorCode } from './errors';

// 入力検証スキーマ（isomorphic だが server 側でも参照しやすいよう再エクスポート）
export { emailSchema, interviewerProfileSchema, companyRoleSchema, companyStatusSchema } from './schemas';
export type { InterviewerProfileInput, CompanyRole, CompanyStatus } from './schemas';

// Better Auth 推論型
export type { User, Session } from './schemas';

/**
 * @bulr/auth/client — Client 専用エントリ
 *
 * Client Component（`'use client'` を持つ tsx）から import する。
 * Server Component から import しても害はないが、Server Component では
 * `@bulr/auth/server` のガードを使うのが正しい。
 *
 * このエントリは `@bulr/auth/server` に含まれる server-only 依存
 * （next/headers・pg・nodemailer 等）を引き込まないことが invariant。
 *
 * Requirements: 1.2, 1.8, 3.6, 11.2, 11.7
 */

// Better Auth クライアントヘルパー
export { authClient, signIn, signOut, useSession } from './client';

// Client 側でも使う isomorphic スキーマ（zod のみに依存、サーバ依存なし）
export { emailSchema, interviewerProfileSchema } from './schemas';
export type { InterviewerProfileInput } from './schemas';

// エラー型（Client 側で AuthError を catch するケース向け）
export { AuthError } from './errors';
export type { AuthErrorCode } from './errors';

/**
 * @bulr/auth — Better Auth 設定とガード／safe-action の 3 アプリ共有公開 API
 *
 * 本ファイルはバレル。具体的な実装は各モジュール（server / client / guards /
 * safe-action / schemas / errors）に分かれている。公開シンボル一覧は
 * `design.md` セクション 7「Components and Interfaces > Shared Packages Layer >
 * packages/auth > Service Interface」に準拠する。
 *
 * Requirements: 5.1, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11
 */

// Better Auth サーバインスタンス（各アプリの /api/auth/[...all] でマウント）
export { auth } from "./server";

// クライアント側ヘルパー（React Client Component から利用）
export { authClient, signIn, signOut, useSession } from "./client";

// 認証ガード（Server Component / Server Action / Route Handler の先頭で呼ぶ）
export {
  getCurrentUser,
  requireUser,
  requireAdmin,
  requireSessionOwnership,
} from "./guards";

// Server Action ラッパー（型安全な認可付き Server Action を提供）
export { authedAction, adminAction } from "./safe-action";
export type { Result } from "./safe-action";

// エラー型
export { AuthError } from "./errors";
export type { AuthErrorCode } from "./errors";

// Better Auth 推論型（design.md Service Interface 準拠）
export type { User, Session } from "./schemas";

// 入力検証スキーマ（既存 apps/web から利用される共有スキーマ）
export {
  emailSchema,
  interviewerProfileSchema,
} from "./schemas";
export type { InterviewerProfileInput } from "./schemas";

/**
 * @bulr/auth — メインバレル（isomorphic 公開シンボルのみ）
 *
 * Better Auth サーバ／ガード／safe-action は `@bulr/auth/server` から、
 * Better Auth クライアントヘルパーは `@bulr/auth/client` から import すること。
 *
 * 本バレルは Server / Client 両方から安全に import 可能な isomorphic シンボル
 * （zod スキーマ・エラークラス・型）のみを公開する。これにより、Client
 * Component から本バレル経由で誤って server-only シンボルを引き込むことを
 * 防止する（design.md セクション 7「Components > Shared Packages Layer >
 * packages/auth > Service Interface」の subpath 分離方針）。
 *
 * Requirements: 5.6, 5.8, 5.11
 */

// エラー型
export { AuthError } from './errors';
export type { AuthErrorCode } from './errors';

// Better Auth 推論型（design.md Service Interface 準拠）
export type { User, Session } from './schemas';

// 入力検証スキーマ（既存 apps/business / 後続 apps/admin・candidate から共有）
export { emailSchema, interviewerProfileSchema } from './schemas';
export type { InterviewerProfileInput } from './schemas';

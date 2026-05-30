import { z } from "zod";

// Better Auth が管理する user / session テーブルから推論される行型を、
// `@bulr/auth` の公開シンボル（design.md セクション 7「Service Interface」）として
// 再エクスポートする。実体は `packages/db/schema/auth.ts`。
export type { User, Session } from "@bulr/db/schema";

// メールアドレス検証スキーマ (Requirement 9.1)
export const emailSchema = z.string().email().trim().max(254);

// 面接官プロファイル入力検証スキーマ (Requirement 9.3, 9.4, 9.5)
export const interviewerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  roleInOrg: z.string().trim().max(100).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
});

// 型エクスポート (Requirement 9.7)
export type InterviewerProfileInput = z.infer<typeof interviewerProfileSchema>;

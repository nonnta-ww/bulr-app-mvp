// vitest 用 @bulr/db/schema スタブ。
// guards.ts のインポートをスタブに差し替えることで DB 接続を回避する。

export const userProfile = { userId: 'userId', companyId: 'companyId' };
export const company = { id: 'id', status: 'status' };
export const candidateProfile = { userId: 'userId' };
export const account = {};
export const session = {};
export const user = {};
export const verification = {};

// 型エクスポートのスタブ（型のみ使用されるため空でよい）
export type User = { id: string; email: string; emailVerified: boolean; name: string | null; image: string | null; createdAt: Date; updatedAt: Date };
export type Session = { id: string; userId: string; token: string; expiresAt: Date; ipAddress: string | null; userAgent: string | null; createdAt: Date; updatedAt: Date };
export type CandidateProfile = { id: string; userId: string };
export type CompanyStatus = 'active' | 'suspended' | 'terminated';

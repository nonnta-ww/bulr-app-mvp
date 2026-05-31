/**
 * 認証ヘルパー（guards.ts）
 *
 * このファイルは Server Component / Server Action / API Route から呼び出す
 * 認証・認可ユーティリティを提供する。
 *
 * CVE-2025-29927 教訓: proxy.ts の bypass 攻撃があっても、各レイヤーで
 * requireUser() / requireAdmin() を独立して呼び出すことでデータを露出しない。
 *
 * Requirements: 3.8, 4.3, 4.7, 5.1-5.5, 6.8, 10.7, 10.8
 * candidate-auth-onboarding Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import 'server-only';

import { headers } from 'next/headers';

import { db } from '@bulr/db';
import { candidateProfile, userProfile } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';

import { createAuth } from './server';
import { AuthError } from './errors';
import type { CandidateProfile } from '@bulr/db/schema';
import type { User, Session } from './schemas';

/**
 * guards 内部専用の auth インスタンス。
 * セッション読み取り（getSession）にのみ使用する。
 * sendMagicLink は guards では不要なため no-op を注入する。
 */
const auth = createAuth({
  sendMagicLink: async () => {
    // guards 内でメール送信は発生しない（no-op）
  },
});

// AuthError は ./errors に集約済み。後方互換のため re-export する
// （既存 `apps/web` 側 `import { AuthError } from '@/lib/guards'` への配慮）。
export { AuthError };
export type { AuthErrorCode } from './errors';

// ---------------------------------------------------------------------------
// getCurrentUser — throw しない、null を返す
// ---------------------------------------------------------------------------

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
}

// ---------------------------------------------------------------------------
// requireUser — 未認証なら UNAUTHORIZED を throw
// ---------------------------------------------------------------------------

export async function requireUser(): Promise<{ id: string; email: string }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('UNAUTHORIZED');
  return user;
}

// ---------------------------------------------------------------------------
// requireAdmin — requireUser → ADMIN_ALLOWED_EMAILS チェック（fail secure）
// ---------------------------------------------------------------------------

export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const user = await requireUser();
  const allowed =
    process.env.ADMIN_ALLOWED_EMAILS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  // 空配列またはメールが含まれない場合は拒否（fail secure）
  if (allowed.length === 0 || !allowed.includes(user.email)) {
    throw new AuthError('FORBIDDEN');
  }
  return user;
}

// ---------------------------------------------------------------------------
// requireSessionOwnership — セッション所有権チェック
// ---------------------------------------------------------------------------

export function requireSessionOwnership(
  session: { interviewerId: string } | null | undefined,
  userId: string,
): void {
  if (!session) throw new AuthError('NOT_FOUND');
  if (session.interviewerId !== userId) throw new AuthError('FORBIDDEN');
}

// ---------------------------------------------------------------------------
// requireCandidate — 認証済み かつ candidate_profile 存在を確認するガード
//
// candidate-auth-onboarding Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
// ---------------------------------------------------------------------------

export async function requireCandidate(): Promise<{
  user: User;
  session: Session;
  candidateProfile: CandidateProfile;
}> {
  // Step 1: UNAUTHORIZED の throw を requireUser() に委譲（要件 7.2 / design.md L386）
  await requireUser();

  // Step 2: Better Auth フル Session データ取得（User / Session 型構築に必要）
  const sessionData = await auth.api.getSession({ headers: await headers() });

  // Step 3: Fail-secure 二重チェック（requireUser 通過後の多層防御）
  if (!sessionData?.user || !sessionData?.session) throw new AuthError('UNAUTHORIZED');

  const { user: baUser, session: baSession } = sessionData;

  // candidate_profile を userId でクエリする（要件 7.1, 7.3）
  const [profile] = await db
    .select()
    .from(candidateProfile)
    .where(eq(candidateProfile.userId, baUser.id))
    .limit(1);

  // candidate_profile が存在しない場合は CANDIDATE_PROFILE_MISSING を throw（要件 7.3）
  if (!profile) throw new AuthError('CANDIDATE_PROFILE_MISSING');

  // Better Auth の getSession は optional フィールドを string | null | undefined で返すが、
  // Drizzle $inferSelect の User / Session 型は string | null を期待する。
  // undefined → null に正規化して型を揃える。
  const user: User = {
    id: baUser.id,
    email: baUser.email,
    emailVerified: baUser.emailVerified,
    name: baUser.name ?? null,
    image: baUser.image ?? null,
    createdAt: baUser.createdAt,
    updatedAt: baUser.updatedAt,
  };

  const session: Session = {
    id: baSession.id,
    userId: baSession.userId,
    token: baSession.token,
    expiresAt: baSession.expiresAt,
    ipAddress: baSession.ipAddress ?? null,
    userAgent: baSession.userAgent ?? null,
    createdAt: baSession.createdAt,
    updatedAt: baSession.updatedAt,
  };

  return { user, session, candidateProfile: profile };
}

// ---------------------------------------------------------------------------
// requireCompanyUser — 認証済み かつ user_profile に company_id が存在することを確認するガード
//
// company-and-opening Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
// ---------------------------------------------------------------------------

export async function requireCompanyUser(): Promise<{ user: User; companyId: string }> {
  // Step 1: UNAUTHORIZED の throw を requireUser() に委譲（design.md パターン）
  await requireUser();

  // Step 2: Better Auth フル Session データ取得（user.id を取得するため）
  const sessionData = await auth.api.getSession({ headers: await headers() });

  // Step 3: Fail-secure 二重チェック（requireUser 通過後の多層防御）
  if (!sessionData?.user) throw new AuthError('UNAUTHORIZED');

  const baUser = sessionData.user;

  // user_profile を userId でクエリし company_id を取得する
  const [profile] = await db
    .select({ companyId: userProfile.companyId })
    .from(userProfile)
    .where(eq(userProfile.userId, baUser.id))
    .limit(1);

  // company_id が NULL の場合は COMPANY_NOT_ASSOCIATED を throw
  if (!profile?.companyId) {
    throw new AuthError('COMPANY_NOT_ASSOCIATED');
  }

  // Better Auth の getSession は optional フィールドを string | null | undefined で返すが、
  // Drizzle $inferSelect の User 型は string | null を期待する。
  // undefined → null に正規化して型を揃える。
  const user: User = {
    id: baUser.id,
    email: baUser.email,
    emailVerified: baUser.emailVerified,
    name: baUser.name ?? null,
    image: baUser.image ?? null,
    createdAt: baUser.createdAt,
    updatedAt: baUser.updatedAt,
  };

  return { user, companyId: profile.companyId };
}

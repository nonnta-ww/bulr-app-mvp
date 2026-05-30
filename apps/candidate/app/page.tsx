/**
 * apps/candidate トップページ（サインイン済みプレースホルダ）
 *
 * - 未サインインなら `/sign-in` にリダイレクト
 * - サインイン済みかつ candidate_profile 未存在なら `/onboarding` にリダイレクト
 * - サインイン済みかつ candidate_profile 存在なら本ページ（プレースホルダ）を表示
 *
 * candidate-auth-onboarding Requirements: 4.3, 4.4
 * Wave 1 既存 Requirements: 4.2, 4.4, 4.5, 4.7
 */

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getCurrentUser } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';

export default async function Page() {
  const user = await getCurrentUser();
  if (user === null) {
    redirect('/sign-in');
  }

  const [profile] = await db
    .select({ id: candidateProfile.id })
    .from(candidateProfile)
    .where(eq(candidateProfile.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect('/onboarding');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">bulr 候補者ポータル</h1>
      <p className="text-sm text-gray-600">
        サインインしました。Wave 2 以降で履歴書登録・自己診断・模擬面接などの機能を順次追加予定です。
      </p>
    </main>
  );
}

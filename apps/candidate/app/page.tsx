/**
 * apps/candidate トップページ（サインイン済みホーム）
 *
 * - 未サインインなら `/sign-in` にリダイレクト
 * - サインイン済みかつ candidate_profile 未存在なら `/onboarding` にリダイレクト
 * - サインイン済みかつ candidate_profile 存在なら本ページを表示
 *
 * candidate-auth-onboarding Requirements: 4.3, 4.4
 * Wave 1 既存 Requirements: 4.2, 4.4, 4.5, 4.7
 * candidate-self-analysis Requirements: 8.1, 8.2
 */

import Link from 'next/link';
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">bulr 候補者ポータル</h1>
        <p className="mt-1 text-sm text-gray-600">ようこそ。各機能から始めてみましょう。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 自己分析（Req 8.1, 8.2） */}
        <Link
          href="/self-analysis"
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm hover:border-blue-400 hover:shadow-md"
        >
          <span className="text-base font-medium text-gray-900">自己分析</span>
          <span className="text-sm text-gray-600">
            skill-survey の回答をもとに、あなたの強み・弱み・成長アクションを確認できます。
          </span>
          <span className="mt-1 text-xs text-amber-700">
            ※ 自己分析には、先に skill-survey への回答が必要です。
          </span>
        </Link>
      </div>
    </main>
  );
}

/**
 * オンボーディングページ（Server Component）
 *
 * - requireUser() でセッションを確認する（未認証なら UNAUTHORIZED を throw）。
 * - candidate_profile が既に存在する場合は '/' にリダイレクトする（二重オンボーディング防止）。
 * - プロファイルが存在しない場合は OnboardingForm を表示する。
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { requireUser } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';

import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const user = await requireUser();

  // candidate_profile が既に存在する場合はトップへリダイレクト
  const [existing] = await db
    .select()
    .from(candidateProfile)
    .where(eq(candidateProfile.userId, user.id))
    .limit(1);

  if (existing) {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">プロフィールを設定</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          bulr に表示されるお名前を入力してください。
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}

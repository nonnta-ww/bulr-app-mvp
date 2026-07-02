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
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-card border border-hairline bg-card p-6 shadow-ambient md:p-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-primary">
            <span className="material-symbols-outlined fill text-[32px]" aria-hidden="true">
              waving_hand
            </span>
          </div>
          <h1 className="text-2xl font-bold text-ink">
            はじめまして！
            <br />
            表示名を教えてください
          </h1>
          <p className="text-base text-body">後からいつでも変更できます。</p>
        </header>
        <OnboardingForm />
      </div>
    </main>
  );
}

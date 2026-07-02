/**
 * 履歴書アップロードページ (Server Component)
 *
 * - requireCandidate() で認証 + candidate_profile 存在確認
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - 認証 OK で ResumeUploadForm をレンダリング
 *
 * Requirements: 3.7, 8.1, 8.2, 8.3
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { requireCandidate, AuthError } from '@bulr/auth/server';

import { ResumeUploadForm } from '../_components/resume-upload-form';

export default async function ResumeUploadPage() {
  try {
    await requireCandidate();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8 md:px-8 md:py-12">
      <nav className="mb-4">
        <Link
          href="/resume"
          className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_back
          </span>
          履歴書管理
        </Link>
      </nav>
      <div className="rounded-card border border-hairline bg-card p-6 shadow-ambient md:p-10">
        <h1 className="mb-6 text-2xl font-bold text-ink">履歴書をアップロード</h1>
        <ResumeUploadForm />
      </div>
    </main>
  );
}

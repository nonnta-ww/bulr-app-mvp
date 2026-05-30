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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/resume" className="hover:underline">
          ← 履歴書一覧に戻る
        </Link>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">履歴書をアップロード</h1>
      <p className="mb-6 text-sm text-gray-600">
        履歴書・職務経歴書・CV・レジュメをアップロードできます。種別ごとに最新版が「メイン」として企業へのエントリーに使われます。
      </p>
      <ResumeUploadForm />
    </main>
  );
}

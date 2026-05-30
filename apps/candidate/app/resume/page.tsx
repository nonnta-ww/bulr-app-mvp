/**
 * 履歴書一覧ページ (Server Component)
 *
 * - requireCandidate() で認証 + candidate_profile 存在確認
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - getResumeDocuments(candidateProfile.id) で履歴書一覧を取得
 * - ResumeList Client Component に渡してレンダリング
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 8.3
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { getResumeDocuments } from '@bulr/db';

import { ResumeList } from './_components/resume-list';

export default async function ResumeListPage() {
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  const documents = await getResumeDocuments(candidateProfileId);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">履歴書管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            履歴書・職務経歴書・CV・レジュメ を種別ごとに管理します。
          </p>
        </div>
        <Link
          href="/resume/upload"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + アップロード
        </Link>
      </div>
      <ResumeList documents={documents} />
    </main>
  );
}

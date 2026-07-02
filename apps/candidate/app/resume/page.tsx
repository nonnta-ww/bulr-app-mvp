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
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink md:text-3xl">履歴書管理</h1>
          <p className="mt-2 text-base text-body">
            アップロードされた職務経歴書や CV を管理・更新します。
          </p>
        </div>
        <Link
          href="/resume/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            add
          </span>
          アップロード
        </Link>
      </div>

      <ResumeList documents={documents} />

      {/* 履歴書の最適化 ヒント */}
      <div className="mt-6 flex items-start gap-3 rounded-card border border-hairline bg-card p-6 shadow-ambient">
        <span className="material-symbols-outlined text-primary" aria-hidden="true">
          lightbulb
        </span>
        <div>
          <h2 className="text-base font-bold text-ink">履歴書の最適化</h2>
          <p className="mt-1 text-sm leading-relaxed text-body">
            アップロードされた履歴書は、AI による自動解析とスキルキーワードの抽出に使用されます。最新の経験を反映させることで、模擬面接の精度が向上します。
          </p>
        </div>
      </div>
    </main>
  );
}

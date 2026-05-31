/**
 * 候補者エントリー一覧ページ（Server Component）
 *
 * - requireCandidate() でガード
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - getEntriesByCandidateProfileId(candidateProfile.id) でエントリー一覧取得
 * - エントリーをカード形式で表示（企業名・募集名・ステータス・エントリー日）
 * - 0 件なら Empty State を表示
 *
 * Requirements: entry-flow 5.1, 5.2, 5.3, 5.4
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { getEntriesByCandidateProfileId } from '@bulr/db';
import type { EntryStatus } from '@bulr/db/schema';

/** エントリーステータスの日本語ラベル */
const STATUS_LABEL: Record<EntryStatus, string> = {
  submitted: '書類確認中',
  reviewed: '確認済み',
  rejected: '不合格',
  progressing: '選考中',
};

/** ステータスに対応するバッジの色クラス */
const STATUS_CLASS: Record<EntryStatus, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  reviewed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  progressing: 'bg-yellow-100 text-yellow-800',
};

/** Asia/Tokyo タイムゾーンで日付フォーマット */
function formatDate(date: Date): string {
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function EntriesPage() {
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

  const entries = await getEntriesByCandidateProfileId(candidateProfileId);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">エントリー一覧</h1>
        <p className="mt-1 text-sm text-gray-600">
          応募した求人のエントリー状況を確認できます。
        </p>
      </div>

      {entries.length === 0 ? (
        /* Empty State */
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">まだエントリーはありません。</p>
          <p className="mt-2 text-sm text-gray-400">
            まずは{' '}
            <Link href="/resume/upload" className="text-blue-600 underline hover:text-blue-800">
              履歴書を登録
            </Link>
            {' '}したり、{' '}
            <Link href="/skill-survey" className="text-blue-600 underline hover:text-blue-800">
              スキルアンケートに回答
            </Link>
            {' '}してみましょう。
          </p>
        </div>
      ) : (
        /* エントリー一覧 */
        <ul className="space-y-4">
          {entries.map(({ entry, opening, company }) => (
            <li
              key={entry.id}
              className="rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-gray-900">
                    {opening.title}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">{company.name}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[entry.status]}`}
                >
                  {STATUS_LABEL[entry.status]}
                </span>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                エントリー日: {formatDate(entry.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

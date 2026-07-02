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

/** ステータスに対応するバッジの色クラス（Zenith） */
const STATUS_CLASS: Record<EntryStatus, string> = {
  submitted: 'bg-surface-2 text-slate',
  reviewed: 'bg-emerald-100 text-emerald-800',
  progressing: 'bg-primary/15 text-[#8f4d00]',
  rejected: 'bg-[#ffdad6] text-[#93000a]',
};

/** Asia/Tokyo タイムゾーンで日付フォーマット（YYYY/MM/DD） */
function formatDate(date: Date): string {
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink md:text-3xl">エントリー状況</h1>
        <p className="mt-2 text-base text-body">応募した求人のエントリー状況を確認できます。</p>
      </header>

      {entries.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center gap-4 rounded-card border border-hairline bg-card px-6 py-14 text-center shadow-ambient">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-slate">
            <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
              description
            </span>
          </span>
          <div>
            <p className="text-lg font-bold text-ink">まだエントリーがありません</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-body">
              新しいキャリアの機会を探して、エントリーを開始しましょう。まずはプロフィールとスキルを充実させることをおすすめします。
            </p>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link
              href="/resume/upload"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate hover:text-ink"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                upload_file
              </span>
              履歴書をアップロード
            </Link>
            <Link
              href="/skill-survey"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate hover:text-ink"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                assessment
              </span>
              スキルアンケートに回答
            </Link>
          </div>
        </div>
      ) : (
        /* エントリー一覧（テーブル風カード） */
        <div className="overflow-hidden rounded-card border border-hairline bg-card shadow-ambient">
          {/* ヘッダ行（デスクトップのみ） */}
          <div className="hidden items-center gap-4 border-b border-hairline px-5 py-3 text-xs font-medium text-muted md:flex">
            <span className="flex-1">企業・ポジション</span>
            <span className="w-32">エントリー日</span>
            <span className="w-24 text-right">ステータス</span>
          </div>

          {entries.map(({ entry, opening, company }, index) => (
            <div
              key={entry.id}
              className={`flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:gap-4 ${
                index > 0 ? 'border-t border-hairline' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{company.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{opening.title}</p>
              </div>
              <span className="text-sm text-muted md:w-32">{formatDate(entry.createdAt)}</span>
              <div className="md:w-24 md:text-right">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[entry.status]}`}
                >
                  {STATUS_LABEL[entry.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

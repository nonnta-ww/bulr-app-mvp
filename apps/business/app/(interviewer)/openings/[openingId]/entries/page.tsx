/**
 * 企業側エントリー一覧ページ（Server Component）
 *
 * /openings/[openingId]/entries で企業ユーザーが当該 opening への
 * エントリー一覧を確認できる。
 * - requireCompanyUser() でガード
 * - opening を id AND company_id で検索し、他社の opening は notFound()
 * - getEntriesByOpeningId(openingId) でエントリー一覧取得
 * - テーブル形式で候補者名・ステータス・エントリー日・詳細リンクを表示
 *
 * Requirements: entry-flow 7.1〜7.4
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';

import { requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db, getEntriesByOpeningId } from '@bulr/db';
import { opening } from '@bulr/db/schema';
import type { EntryStatus } from '@bulr/db/schema';

// ---------------------------------------------------------------------------
// ステータスラベル・バッジマッピング
// ---------------------------------------------------------------------------

const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  submitted: '提出済み',
  reviewed: '確認済み',
  progressing: '進行中',
  rejected: '不採用',
};

const ENTRY_STATUS_BADGE: Record<EntryStatus, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-green-100 text-green-700',
  progressing: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-600',
};

// ---------------------------------------------------------------------------
// 日時フォーマット (Asia/Tokyo)
// ---------------------------------------------------------------------------

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
});

function formatDateTime(date: Date): string {
  return DATE_TIME_FORMAT.format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ openingId: string }>;
}

export default async function BusinessEntriesListPage({ params }: PageProps) {
  const { openingId } = await params;

  // 認証 + 企業所属確認
  let companyId: string;
  try {
    const result = await requireCompanyUser();
    companyId = result.companyId;
  } catch (e) {
    if (e instanceof AuthError) {
      redirect('/sign-in');
    }
    redirect('/sign-in');
  }

  // opening 取得（id AND company_id で絞り込み — 他社の opening は notFound）
  const [ownedOpening] = await db
    .select()
    .from(opening)
    .where(and(eq(opening.id, openingId), eq(opening.companyId, companyId)))
    .limit(1);

  if (!ownedOpening) notFound();

  // エントリー一覧取得
  const entries = await getEntriesByOpeningId(openingId);

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* パンくず */}
        <nav className="text-sm text-gray-500">
          <Link href="/openings" className="hover:text-blue-600 hover:underline">
            募集一覧
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/openings/${openingId}`}
            className="hover:text-blue-600 hover:underline"
          >
            {ownedOpening.title}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">エントリー一覧</span>
        </nav>

        {/* ヘッダ */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            エントリー一覧
            <span className="ml-2 text-sm font-normal text-gray-500">
              — {ownedOpening.title}
            </span>
          </h1>
        </div>

        {/* エントリーテーブル */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm text-gray-500">まだエントリーはありません</p>
              <p className="text-xs text-gray-400">
                候補者が招待リンクからエントリーを確定すると、ここに表示されます。
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">候補者名</th>
                    <th className="px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="px-4 py-3 font-medium text-gray-600">エントリー日時</th>
                    <th className="px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map(({ entry, candidateProfile }) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {candidateProfile.displayName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ENTRY_STATUS_BADGE[entry.status]}`}
                        >
                          {ENTRY_STATUS_LABEL[entry.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/openings/${openingId}/entries/${entry.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          詳細を見る
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 戻りリンク */}
        <div>
          <Link
            href={`/openings/${openingId}`}
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            ← {ownedOpening.title} に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}

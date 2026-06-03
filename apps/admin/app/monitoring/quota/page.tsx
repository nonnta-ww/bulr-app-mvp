/**
 * 管理画面 クォータ使用状況ページ（apps/admin: /monitoring/quota）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getCandidateQuotaUsage() で全候補者のクォータ使用状況を取得してテーブル表示する。
 * isLimitReached = true の行は赤背景で強調し、上限到達バッジを表示する。
 * 読み取り専用（ミューテーションなし）。
 *
 * Requirements: 5.3, 5.4, 5.5, 6.1
 * Boundary: QuotaPage (this file only)
 * Depends: 6.1 ✓ (getCandidateQuotaUsage), 6.2 ✓ (monitoring-query), 6.3 ✓ (monitoring-query)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getCandidateQuotaUsage } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** Date を「YYYY-MM-DD HH:mm」形式（JST）に整形する */
function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  })
    .format(date)
    .replace(/\//g, '-');
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function QuotaPage() {
  // Layer 2 多層防御: 未認証・非管理者は弾く
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        redirect('/sign-in');
      }
      if (err.code === 'FORBIDDEN') {
        notFound();
      }
    }
    throw err;
  }

  // DBクエリ
  const quotaList = await getCandidateQuotaUsage();

  // 上限到達件数サマリー
  const limitReachedCount = quotaList.filter((r) => r.isLimitReached).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">クォータ使用状況</h1>
        <Link
          href="/monitoring"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          ← コストダッシュボード
        </Link>
      </div>

      {/* サマリーバナー */}
      {limitReachedCount > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">
            上限到達: {limitReachedCount} 名の候補者が今月のクォータ（3 回）に達しています
          </p>
        </div>
      )}

      {/* テーブル */}
      {quotaList.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">候補者がいません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">表示名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">メールアドレス</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  当月使用 / 上限
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">最終実施日時</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {quotaList.map((row) => (
                <tr
                  key={row.candidateProfileId}
                  className={`transition-colors hover:bg-gray-50 ${
                    row.isLimitReached ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.displayName}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.email}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">
                    {row.usedThisMonth} / {row.monthlyLimit}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatDate(row.lastSessionAt)}
                  </td>
                  <td className="px-4 py-3">
                    {row.isLimitReached ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        上限到達
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        余裕あり
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/candidates/${row.candidateProfileId}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

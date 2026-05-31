/**
 * 募集一覧ページ（Server Component）
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { opening } from '@bulr/db/schema';
import { requireCompanyUser, AuthError } from '@bulr/auth/server';

// ---------------------------------------------------------------------------
// ステータスラベルマッピング
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  open: '公開中',
  closed: '終了',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-600',
};

// ---------------------------------------------------------------------------
// 日時フォーマット
// ---------------------------------------------------------------------------

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OpeningsPage() {
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

  const openings = await db
    .select()
    .from(opening)
    .where(eq(opening.companyId, companyId))
    .orderBy(desc(opening.createdAt));

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">募集一覧</h1>
          <Link
            href="/openings/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            + 新規募集を作成
          </Link>
        </div>

        {/* 一覧 */}
        {openings.length === 0 ? (
          <div className="rounded-xl bg-white px-8 py-16 text-center shadow-sm">
            <p className="text-gray-500">まだ募集がありません。</p>
            <Link
              href="/openings/new"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              最初の募集を作成する
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">タイトル</th>
                  <th className="px-4 py-3 font-medium text-gray-600">ステータス</th>
                  <th className="px-4 py-3 font-medium text-gray-600">作成日</th>
                  <th className="px-4 py-3 font-medium text-gray-600">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {openings.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{o.title}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/openings/${o.id}`}
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
      </div>
    </main>
  );
}

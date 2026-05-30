/**
 * 管理画面 セッション一覧ページ（apps/admin: /sessions）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * フィルタ・ソート条件を searchParams から取得し、sessionListQuery でデータを取得して
 * SessionListFilters / SessionListTable に渡す。
 *
 * monorepo-app-split Task 4.3 で apps/business から flat URL（/sessions）に移設。
 * 旧パス: apps/business/app/admin/sessions/page.tsx（/admin/sessions）。
 *
 * Requirements: 1.1, 1.2, 1.7, 2.3, 2.4, 3.4, 10.1, 13.1, 13.2
 * Boundary: SessionListPage (this file only)
 * Depends: 2.1 ✓ (parseListQueryParams), 2.2 ✓ (sessionListQuery),
 *          2.3 ✓ (SessionListFilters), 2.3 ✓ (SessionListTable)
 */

import { notFound, redirect } from 'next/navigation';

import { SessionListFilters } from '@/app/_components/session-list-filters';
import { SessionListTable } from '@/app/_components/session-list-table';
import { parseListQueryParams } from '@/app/_lib/list-query-params';
import { AuthError, requireAdmin } from '@bulr/auth/server';
import { sessionListQuery } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: searchParams は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function SessionListPage({ searchParams }: PageProps) {
  // Layer 2 多層防御: 未認証・非管理者は弾く
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        redirect('/sign-in');
      }
      if (err.code === 'FORBIDDEN') {
        // 管理者として登録されていない場合
        notFound();
      }
    }
    // その他のエラーは上位に再スロー
    throw err;
  }

  // searchParams のパース（Next.js 16: async）
  const rawParams = await searchParams;
  const params = parseListQueryParams(rawParams);

  // DBクエリ
  const items = await sessionListQuery(params);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">セッション一覧</h1>

      {/* フィルタ・ソート */}
      <div className="mb-4">
        <SessionListFilters current={params} />
      </div>

      {/* セッションテーブル */}
      <SessionListTable items={items} />
    </main>
  );
}

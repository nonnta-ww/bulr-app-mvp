'use client';

/**
 * セッション一覧フィルタ + ソート Client Component
 *
 * フィルタ / ソート条件を select で選択し、変更時に URL クエリパラメータを更新する。
 *
 * Requirements: 2.1-2.5, 3.1-3.5
 * Boundary: SessionListFilters (this file only)
 */

import { useRouter } from 'next/navigation';

import type { ListQueryParams } from '@/app/admin/_lib/list-query-params';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  current: ListQueryParams;
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SessionListFilters({ current }: Props) {
  const router = useRouter();

  function handleChange(patch: Partial<ListQueryParams>) {
    const next: ListQueryParams = { ...current, ...patch };
    const params = new URLSearchParams({
      reviewStatus: next.reviewStatus,
      status: next.status,
      sortBy: next.sortBy,
      sortOrder: next.sortOrder,
    });
    router.push('/admin/sessions?' + params.toString());
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* レビューステータス */}
      <label className="flex items-center gap-1.5 text-sm text-gray-700">
        <span className="whitespace-nowrap font-medium">レビューステータス</span>
        <select
          value={current.reviewStatus}
          onChange={(e) =>
            handleChange({
              reviewStatus: e.target.value as ListQueryParams['reviewStatus'],
            })
          }
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">全件</option>
          <option value="pending">未レビュー</option>
          <option value="partial">一部レビュー</option>
          <option value="reviewed">レビュー済み</option>
        </select>
      </label>

      {/* ステータス */}
      <label className="flex items-center gap-1.5 text-sm text-gray-700">
        <span className="whitespace-nowrap font-medium">ステータス</span>
        <select
          value={current.status}
          onChange={(e) =>
            handleChange({
              status: e.target.value as ListQueryParams['status'],
            })
          }
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">全件</option>
          <option value="in_progress">進行中</option>
          <option value="completed">完了</option>
          <option value="abandoned">中断</option>
        </select>
      </label>

      {/* ソートキー */}
      <label className="flex items-center gap-1.5 text-sm text-gray-700">
        <span className="whitespace-nowrap font-medium">並び順</span>
        <select
          value={current.sortBy}
          onChange={(e) =>
            handleChange({
              sortBy: e.target.value as ListQueryParams['sortBy'],
            })
          }
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="started_at">開始時刻</option>
          <option value="candidate_name">候補者名</option>
          <option value="avg_score">平均スコア</option>
        </select>
      </label>

      {/* ソート方向 */}
      <label className="flex items-center gap-1.5 text-sm text-gray-700">
        <span className="whitespace-nowrap font-medium">方向</span>
        <select
          value={current.sortOrder}
          onChange={(e) =>
            handleChange({
              sortOrder: e.target.value as ListQueryParams['sortOrder'],
            })
          }
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="desc">降順</option>
          <option value="asc">昇順</option>
        </select>
      </label>
    </div>
  );
}

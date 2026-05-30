/**
 * セッション一覧テーブルコンポーネント
 *
 * Server Component。管理画面のセッション一覧を表形式で表示する。
 *
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.7
 * Boundary: SessionListTable (this file only)
 */

import Link from 'next/link';

import type { SessionListItem } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  items: SessionListItem[];
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ISO 8601 文字列を「YYYY-MM-DD HH:mm」形式に整形する。
 * null / 空文字の場合は「-」を返す。
 */
function formatDatetime(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '-';

  const formatted = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);

  // Intl.DateTimeFormat('ja-JP') は「2024/01/15 09:30」形式を返すため
  // スラッシュをハイフンに置換して「2024-01-15 09:30」に統一する
  return formatted.replace(/\//g, '-');
}

/**
 * ステータスラベルを日本語に変換する。
 */
function statusLabel(status: SessionListItem['status']): string {
  switch (status) {
    case 'in_progress':
      return '進行中';
    case 'completed':
      return '完了';
    case 'abandoned':
      return '中断';
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// レビューステータスバッジ
// ---------------------------------------------------------------------------

type ReviewStatus = SessionListItem['review_status'];

const reviewBadgeClass: Record<ReviewStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  partial: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-green-100 text-green-800',
};

const reviewBadgeLabel: Record<ReviewStatus, string> = {
  pending: '未レビュー',
  partial: '一部レビュー済',
  reviewed: 'レビュー済',
};

function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${reviewBadgeClass[status]}`}
    >
      {reviewBadgeLabel[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SessionListTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        セッションがありません
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              候補者名
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              面接官 email
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              ステータス
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              開始時刻
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              終了時刻
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">
              ターン数
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">
              平均スコア
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              レビューステータス
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {items.map((item) => (
            <tr
              key={item.id}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3 font-medium text-gray-900">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {item.candidate_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-700">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {item.interviewer_email}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-700">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {statusLabel(item.status)}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-700">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {formatDatetime(item.started_at)}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-700">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {formatDatetime(item.completed_at)}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {item.turn_count}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                <Link
                  href={`/sessions/${item.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {item.avg_score !== null ? item.avg_score.toFixed(2) : '-'}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link href={`/sessions/${item.id}`}>
                  <ReviewBadge status={item.review_status} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

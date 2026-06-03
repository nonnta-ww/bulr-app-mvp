/**
 * 管理画面 候補者一覧ページ（apps/admin: /candidates）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * searchParams から search / page / isActive を取得し、getCandidatesForAdmin で
 * データを取得して SearchFilter + テーブルを描画する。
 *
 * Requirements: 1.1, 1.2, 6.1
 * Boundary: CandidateListPage (this file only)
 * Depends: 2.1 ✓ (getCandidatesForAdmin), 7.1 ✓ (disableCandidate action)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { SearchFilter } from '@/app/_components/search-filter';
import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getCandidatesForAdmin } from '@bulr/db/queries/admin';

import { disableCandidate } from './_actions/disable-candidate';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: searchParams は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** searchParams の配列を正規化して先頭要素のみ返す */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

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

export default async function CandidateListPage({ searchParams }: PageProps) {
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

  // searchParams のアンラップ（Next.js 16: async）
  const rawParams = await searchParams;

  const search = first(rawParams['search']) ?? '';
  const pageStr = first(rawParams['page']) ?? '1';
  const isActiveStr = first(rawParams['isActive']);

  const page = Math.max(1, parseInt(pageStr, 10) || 1);

  let isActive: boolean | undefined;
  if (isActiveStr === 'true') isActive = true;
  else if (isActiveStr === 'false') isActive = false;

  // DBクエリ
  const { items, total } = await getCandidatesForAdmin({
    search: search || undefined,
    isActive,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  // ページネーションリンク用パラメータ構築ヘルパー
  function buildPageUrl(targetPage: number) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (isActiveStr !== undefined) params.set('isActive', isActiveStr);
    params.set('page', String(targetPage));
    return '/candidates?' + params.toString();
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">候補者一覧</h1>

      {/* フィルタ行 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchFilter placeholder="氏名・メールで検索" paramKey="search" />

        {/* 有効/無効フィルタ（GET フォーム） */}
        <form method="GET" action="/candidates" className="flex items-center gap-2">
          {search && <input type="hidden" name="search" value={search} />}
          <select
            name="isActive"
            defaultValue={isActiveStr ?? ''}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="有効/無効フィルタ"
          >
            <option value="">全件</option>
            <option value="true">有効のみ</option>
            <option value="false">無効のみ</option>
          </select>
          <button
            type="submit"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            絞り込み
          </button>
        </form>
      </div>

      {/* テーブル */}
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">候補者がいません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">表示名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">メールアドレス</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  クォータ使用数 / 上限
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">アンケート</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">登録日時</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-gray-50 ${
                    !item.isActive ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.displayName}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{item.email}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {item.usedThisMonth} / 3
                  </td>
                  <td className="px-4 py-3">
                    {item.surveyCompleted ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        完了
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        未回答
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        有効
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        無効
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/candidates/${item.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                      {item.isActive && (
                        <DisableCandidateButton candidateProfileId={item.id} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ページネーション */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <p>
          全 {total} 件中 {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}〜
          {Math.min(page * PAGE_SIZE, total)} 件を表示
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={buildPageUrl(page - 1)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50"
            >
              前へ
            </Link>
          ) : (
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-400">
              前へ
            </span>
          )}
          <span className="px-3 py-1.5">
            {page} / {totalPages}
          </span>
          {hasNext ? (
            <Link
              href={buildPageUrl(page + 1)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50"
            >
              次へ
            </Link>
          ) : (
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-400">
              次へ
            </span>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 無効化ボタン（Server Component 内インライン）
// ---------------------------------------------------------------------------

/**
 * 候補者無効化フォームボタン。
 * adminAction ラッパーの型が (rawInput: unknown) => Promise<Result<R>> であるため、
 * インライン Server Action でラップして form action に渡す。
 */
function DisableCandidateButton({ candidateProfileId }: { candidateProfileId: string }) {
  async function handleDisable(_formData: FormData) {
    'use server';
    await disableCandidate({ candidateProfileId });
  }

  return (
    <form action={handleDisable}>
      <button
        type="submit"
        className="text-sm text-red-600 hover:underline"
      >
        無効化
      </button>
    </form>
  );
}

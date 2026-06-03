/**
 * 管理画面 企業詳細ページ（apps/admin: /companies/[id]）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getCompanyDetail でデータを取得し、基本情報・募集一覧・面接官一覧を表示する。
 * [無効化] は CompanyActionButtons に委譲。
 *
 * Requirements: 2.1, 2.2, 2.3, 6.1
 * Boundary: CompanyDetailPage (this file only)
 * Depends: 3.2 ✓ (getCompanyDetail), 8.2 ✓ (disableCompany)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getCompanyDetail } from '@bulr/db/queries/admin';

import { CompanyActionButtons } from '../_components/company-action-buttons';

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: params は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** Date を「YYYY-MM-DD HH:mm:ss」形式（JST）に整形する。null の場合は「—」を返す。 */
function formatTimestamp(date: Date | null | undefined): string {
  if (date == null) return '—';
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  })
    .format(d)
    .replace(/\//g, '-');
}

/** 定義リスト行（ラベル + 値） */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-2 py-1.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function CompanyDetailPage({ params }: PageProps) {
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

  // params のアンラップ（Next.js 16: async）
  const { id } = await params;

  if (!id || typeof id !== 'string') {
    notFound();
  }

  // DBクエリ
  const detail = await getCompanyDetail(id);
  if (!detail) {
    notFound();
  }

  const { company, openings, interviewers } = detail;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* ページタイトル + 戻るリンク */}
      <div className="flex items-center gap-4">
        <Link
          href="/companies"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 企業一覧へ
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">企業詳細</h1>
      </div>

      {/* 基本情報 */}
      <section aria-labelledby="basic-info-heading">
        <h2
          id="basic-info-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          基本情報
        </h2>
        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
          <Term label="ID">{company.id}</Term>
          <Term label="企業名">{company.name}</Term>
          <Term label="ステータス">
            {company.isActive ? (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                有効
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                無効
              </span>
            )}
          </Term>
          <Term label="登録日時">{formatTimestamp(company.createdAt)}</Term>
        </dl>
      </section>

      {/* アクションボタン */}
      <section aria-labelledby="actions-heading">
        <h2
          id="actions-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          管理操作
        </h2>
        <CompanyActionButtons companyId={company.id} isActive={company.isActive} />
      </section>

      {/* 募集一覧 */}
      <section aria-labelledby="openings-heading">
        <h2
          id="openings-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          募集一覧（{openings.length} 件）
        </h2>
        {openings.length === 0 ? (
          <p className="text-sm text-gray-500">募集がありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">タイトル</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">作成日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {openings.map((opening) => (
                  <tr key={opening.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{opening.title}</td>
                    <td className="px-4 py-3 text-gray-700">{opening.status}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTimestamp(opening.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 面接官（メンバーユーザー）一覧 */}
      <section aria-labelledby="interviewers-heading">
        <h2
          id="interviewers-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          面接官一覧（{interviewers.length} 名）
        </h2>
        {interviewers.length === 0 ? (
          <p className="text-sm text-gray-500">面接官がいません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">表示名</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">メールアドレス</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">役割</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {interviewers.map((interviewer) => (
                  <tr key={interviewer.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{interviewer.displayName}</td>
                    <td className="px-4 py-3 text-gray-700">{interviewer.email}</td>
                    <td className="px-4 py-3 text-gray-700">{interviewer.roleInOrg ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

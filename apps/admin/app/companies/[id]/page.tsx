/**
 * 管理画面 企業詳細ページ（apps/admin: /companies/[id]）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getCompanyDetail でデータを取得し、基本情報・管理操作・招待・募集一覧・面接官一覧を表示する。
 *
 * Requirements: 1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.2, 4.3, 4.4, 6.1
 * Boundary: CompanyDetailPage (this file only)
 * Depends: getCompanyDetail, CompanyStatusControls, InviteMemberForm,
 *          PendingInvitationsTable, MemberRemoveButton
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getCompanyDetail } from '@bulr/db/queries/admin';

import { CompanyStatusControls } from './_components/company-status-controls';
import { InviteMemberForm } from './_components/invite-member-form';
import { MemberRemoveButton } from './_components/member-remove-button';
import { PendingInvitationsTable } from './_components/pending-invitations-table';

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

/** ステータスバッジ */
function StatusBadge({ status }: { status: 'active' | 'suspended' | 'terminated' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
        有効
      </span>
    );
  }
  if (status === 'suspended') {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
        一時停止
      </span>
    );
  }
  // terminated
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      解約
    </span>
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

  const { company, openings, interviewers, pendingInvitations } = detail;

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
            <StatusBadge status={company.status} />
          </Term>
          <Term label="登録日時">{formatTimestamp(company.createdAt)}</Term>
        </dl>
      </section>

      {/* 管理操作 */}
      <section aria-labelledby="actions-heading">
        <h2
          id="actions-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          管理操作
        </h2>
        <CompanyStatusControls companyId={company.id} status={company.status} />
      </section>

      {/* 企業ユーザー招待 */}
      <section aria-labelledby="invite-heading">
        <h2
          id="invite-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          企業ユーザー招待
        </h2>
        <div className="space-y-4">
          <InviteMemberForm companyId={company.id} />

          {/* 保留中招待一覧 */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              保留中の招待（{pendingInvitations.length} 件）
            </h3>
            <PendingInvitationsTable invitations={pendingInvitations} />
          </div>
        </div>
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
                  <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {interviewers.map((interviewer) => (
                  <tr key={interviewer.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{interviewer.displayName}</td>
                    <td className="px-4 py-3 text-gray-700">{interviewer.email}</td>
                    <td className="px-4 py-3 text-gray-700">{interviewer.roleInOrg ?? '—'}</td>
                    <td className="px-4 py-3">
                      <MemberRemoveButton
                        companyId={company.id}
                        userId={interviewer.userId}
                      />
                    </td>
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

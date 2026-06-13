/**
 * opening 詳細ページ（Server Component）
 *
 * opening の詳細情報と招待一覧を表示し、招待リンクの発行ができる。
 * 認証 + 企業所属確認を行い、他社の opening は notFound() を返す。
 *
 * Requirements: company-and-opening 6.x, 7.x, 8.x, 9.x
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';

import { requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { opening, invitation } from '@bulr/db/schema';

import { CopyUrlButton } from '../_components/copy-url-button';
import { CreateInvitationButton } from './_components/create-invitation-button';

// ---------------------------------------------------------------------------
// ステータスラベル・バッジマッピング
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
// 日時フォーマット (Asia/Tokyo)
// ---------------------------------------------------------------------------

function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ openingId: string }>;
}

export default async function OpeningDetailPage({ params }: PageProps) {
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

  // opening 取得（id AND company_id で絞り込み — 他社の opening は取得しない）
  const [ownedOpening] = await db
    .select()
    .from(opening)
    .where(and(eq(opening.id, openingId), eq(opening.companyId, companyId)))
    .limit(1);

  if (!ownedOpening) notFound();

  // 招待一覧取得 (created_at DESC)
  const invitations = await db
    .select()
    .from(invitation)
    .where(eq(invitation.openingId, openingId))
    .orderBy(desc(invitation.createdAt));

  const candidateBaseUrl = process.env.CANDIDATE_BASE_URL ?? '';

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* パンくず */}
        <nav className="text-sm text-gray-500">
          <Link href="/openings" className="hover:text-blue-600 hover:underline">
            募集一覧
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{ownedOpening.title}</span>
        </nav>

        {/* opening 基本情報 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900">{ownedOpening.title}</h1>
            <span
              className={`mt-1 inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[ownedOpening.status] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {STATUS_LABEL[ownedOpening.status] ?? ownedOpening.status}
            </span>
          </div>
          {ownedOpening.description ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700">{ownedOpening.description}</p>
          ) : (
            <p className="text-sm text-gray-400">説明はありません。</p>
          )}
        </section>

        {/* 招待リンクセクション */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">招待リンク</h2>
            <CreateInvitationButton openingId={openingId} />
          </div>

          {invitations.length === 0 ? (
            <p className="text-sm text-gray-500">招待リンクがまだ発行されていません。</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">招待 URL</th>
                    <th className="px-4 py-3 font-medium text-gray-600">発行日時</th>
                    <th className="px-4 py-3 font-medium text-gray-600">使用状態</th>
                    <th className="px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invitations.map((inv) => {
                    const url = `${candidateBaseUrl}/invitations/${inv.token}`;
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-gray-700">
                          {url}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatDateTime(inv.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {inv.consumedAt == null ? (
                            <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              未使用
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                              使用済み
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <CopyUrlButton url={url} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {invitations.length > 0 && (
            <div className="mt-3 text-right">
              <Link
                href={`/openings/${openingId}/invitations`}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                招待リンク一覧を見る →
              </Link>
            </div>
          )}
        </section>

        {/* エントリーセクション */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">エントリー</h2>
              <p className="mt-1 text-sm text-gray-500">
                この募集に応募した候補者の一覧を確認し、面接セッションを作成できます。
              </p>
            </div>
            <Link
              href={`/openings/${openingId}/entries`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              エントリー一覧を見る →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

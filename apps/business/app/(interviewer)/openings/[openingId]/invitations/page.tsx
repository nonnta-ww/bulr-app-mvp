/**
 * 招待リンク一覧ページ（Server Component）
 *
 * 特定の opening に紐づく招待リンクを一覧表示する。
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

import { CopyUrlButton } from '../../_components/copy-url-button';
import { CreateInvitationButton } from '../_components/create-invitation-button';

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

export default async function InvitationsPage({ params }: PageProps) {
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

  // opening 所有権確認（id AND company_id — 他社の opening は取得しない）
  const [ownedOpening] = await db
    .select({ id: opening.id, title: opening.title })
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
          <span className="text-gray-900">招待リンク一覧</span>
        </nav>

        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">招待リンク一覧</h1>
          <CreateInvitationButton openingId={openingId} />
        </div>

        {/* 招待一覧 */}
        {invitations.length === 0 ? (
          <div className="rounded-xl bg-white px-8 py-16 text-center shadow-sm">
            <p className="text-gray-500">招待リンクがまだ発行されていません。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
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
                          <div>
                            <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              未使用
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                              使用済み
                            </span>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatDateTime(inv.consumedAt)}
                            </p>
                          </div>
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
      </div>
    </main>
  );
}

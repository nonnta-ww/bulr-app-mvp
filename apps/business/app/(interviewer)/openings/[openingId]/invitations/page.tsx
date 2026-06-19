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

import { Badge } from '@/components/ui/badge';

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
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-[1280px]">
        {/* パンくず */}
        <nav className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Link href="/openings" className="hover:text-ink">
            募集
          </Link>
          <span className="text-hairline-strong">/</span>
          <Link href={`/openings/${openingId}`} className="hover:text-ink">
            {ownedOpening.title}
          </Link>
          <span className="text-hairline-strong">/</span>
          <span className="text-ink">招待リンク</span>
        </nav>

        {/* ヘッダー */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">招待リンク</h1>
          <CreateInvitationButton openingId={openingId} />
        </div>

        {/* 招待一覧 */}
        {invitations.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-card px-8 py-16 text-center">
            <p className="text-body">招待リンクがまだ発行されていません。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline bg-sidebar text-[11px] font-medium uppercase tracking-wider text-muted">
                    <th className="px-6 py-4 font-medium">招待 URL</th>
                    <th className="px-6 py-4 font-medium">発行日時</th>
                    <th className="px-6 py-4 font-medium">状態</th>
                    <th className="w-16 px-6 py-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline text-sm">
                  {invitations.map((inv) => {
                    const url = `${candidateBaseUrl}/invitations/${inv.token}`;
                    const consumed = inv.consumedAt != null;
                    return (
                      <tr key={inv.id} className="transition-colors hover:bg-canvas">
                        <td
                          className={`max-w-md truncate px-6 py-4 font-mono text-xs ${consumed ? 'text-muted line-through' : 'text-body'}`}
                        >
                          {url}
                        </td>
                        <td className="px-6 py-4 tabular-nums text-body">
                          {formatDateTime(inv.createdAt)}
                          {consumed && (
                            <span className="mt-0.5 block text-xs text-muted">
                              使用: {formatDateTime(inv.consumedAt)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={consumed ? 'muted' : 'success'}>
                            {consumed ? '使用済み' : '未使用'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <CopyUrlButton url={url} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

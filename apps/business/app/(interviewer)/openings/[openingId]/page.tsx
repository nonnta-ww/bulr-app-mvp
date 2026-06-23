/**
 * opening 詳細ページ（Server Component）
 *
 * opening の詳細情報と招待一覧を表示し、招待リンクの発行ができる。
 * 認証 + 企業所属確認を行い、他社の opening は notFound() を返す。
 *
 * Requirements: company-and-opening 6.x, 7.x, 8.x, 9.x
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';

import { db, getEntriesByOpeningId } from '@bulr/db';
import { opening, invitation } from '@bulr/db/schema';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import {
  ENTRY_STATUS_LABEL,
  ENTRY_STATUS_TONE,
  OPENING_STATUS_LABEL,
  OPENING_STATUS_TONE,
} from '@/lib/status';
import { requireCompanyGate } from '@/lib/company-gate';

import { CopyUrlButton } from '../_components/copy-url-button';
import { CreateInvitationButton } from './_components/create-invitation-button';

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
  const { companyId } = await requireCompanyGate();

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

  // エントリー一覧取得（右カラムのサマリー用）
  const entries = await getEntriesByOpeningId(openingId);

  const candidateBaseUrl = process.env.CANDIDATE_BASE_URL ?? '';

  const entryDateFormat = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-[1280px]">
        {/* パンくず */}
        <nav className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Link href="/openings" className="hover:text-ink">
            募集
          </Link>
          <span className="text-hairline-strong">/</span>
          <span className="text-ink">{ownedOpening.title}</span>
        </nav>

        {/* タイトル + ステータス */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-ink">
              {ownedOpening.title}
            </h1>
            <Badge
              tone={OPENING_STATUS_TONE[ownedOpening.status] ?? 'neutral'}
              dot={ownedOpening.status === 'open'}
              className="mt-1.5"
            >
              {OPENING_STATUS_LABEL[ownedOpening.status] ?? ownedOpening.status}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          {/* 左カラム */}
          <div className="space-y-6">
            {/* 募集概要 */}
            <section className="rounded-xl border border-hairline bg-card p-6">
              <h2 className="mb-4 border-b border-hairline pb-3 text-base font-semibold text-ink">
                募集概要
              </h2>
              {ownedOpening.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
                  {ownedOpening.description}
                </p>
              ) : (
                <p className="text-sm text-muted">説明はありません。</p>
              )}
            </section>

            {/* 招待リンク */}
            <section className="rounded-xl border border-hairline bg-card p-6">
              <div className="mb-4 flex items-center justify-between gap-4 border-b border-hairline pb-3">
                <h2 className="text-base font-semibold text-ink">招待リンク</h2>
                <CreateInvitationButton openingId={openingId} />
              </div>

              {invitations.length === 0 ? (
                <p className="text-sm text-muted">招待リンクがまだ発行されていません。</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-hairline">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-sidebar text-left text-[11px] font-medium uppercase tracking-wider text-muted">
                        <th className="px-4 py-3 font-medium">招待 URL</th>
                        <th className="px-4 py-3 font-medium">発行日時</th>
                        <th className="px-4 py-3 font-medium">状態</th>
                        <th className="w-16 px-4 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {invitations.map((inv) => {
                        const url = `${candidateBaseUrl}/invitations/${inv.token}`;
                        const consumed = inv.consumedAt != null;
                        return (
                          <tr key={inv.id} className="transition-colors hover:bg-canvas">
                            <td
                              className={`max-w-xs truncate px-4 py-3 font-mono text-xs ${consumed ? 'text-muted line-through' : 'text-body'}`}
                            >
                              {url}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-body">
                              {formatDateTime(inv.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={consumed ? 'muted' : 'success'}>
                                {consumed ? '使用済み' : '未使用'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
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
                    className="inline-flex items-center gap-1 text-sm font-medium text-copper hover:underline"
                  >
                    すべて見る
                    <Icon name="arrow_forward" size={16} />
                  </Link>
                </div>
              )}
            </section>
          </div>

          {/* 右カラム: エントリー */}
          <aside>
            <section className="rounded-xl border border-hairline bg-card p-6">
              <div className="mb-4 flex items-center justify-between border-b border-hairline pb-3">
                <h2 className="text-base font-semibold text-ink">エントリー</h2>
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-navy px-2 text-xs font-bold text-white">
                  {entries.length}
                </span>
              </div>

              {entries.length === 0 ? (
                <p className="py-4 text-sm text-muted">まだエントリーはありません。</p>
              ) : (
                <ul className="space-y-2">
                  {entries.map(({ entry, candidateProfile }) => (
                    <li key={entry.id}>
                      <Link
                        href={`/openings/${openingId}/entries/${entry.id}`}
                        className="block rounded-lg border border-hairline px-4 py-3 transition-colors hover:border-hairline-strong hover:bg-canvas"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="font-medium text-ink">
                            {candidateProfile.displayName}
                          </span>
                          <Badge tone={ENTRY_STATUS_TONE[entry.status]}>
                            {ENTRY_STATUS_LABEL[entry.status]}
                          </Badge>
                        </div>
                        <span className="flex items-center gap-1 text-xs tabular-nums text-muted">
                          <Icon name="calendar_today" size={14} />
                          {entryDateFormat.format(entry.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-hairline pt-4 text-center">
                <Link
                  href={`/openings/${openingId}/entries`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-copper hover:underline"
                >
                  エントリー一覧へ
                  <Icon name="arrow_forward" size={16} />
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

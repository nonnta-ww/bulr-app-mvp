/**
 * 企業側エントリー一覧ページ（Server Component）
 *
 * /openings/[openingId]/entries で企業ユーザーが当該 opening への
 * エントリー一覧を確認できる。
 * - requireCompanyUser() でガード
 * - opening を id AND company_id で検索し、他社の opening は notFound()
 * - getEntriesByOpeningId(openingId) でエントリー一覧取得
 * - テーブル形式で候補者名・ステータス・エントリー日・詳細リンクを表示
 *
 * Requirements: entry-flow 7.1〜7.4
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';

import { requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db, getEntriesByOpeningId } from '@bulr/db';
import { opening } from '@bulr/db/schema';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ENTRY_STATUS_LABEL, ENTRY_STATUS_TONE } from '@/lib/status';

// ---------------------------------------------------------------------------
// 日時フォーマット (Asia/Tokyo)
// ---------------------------------------------------------------------------

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
});

function formatDateTime(date: Date): string {
  return DATE_TIME_FORMAT.format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ openingId: string }>;
}

export default async function BusinessEntriesListPage({ params }: PageProps) {
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

  // opening 取得（id AND company_id で絞り込み — 他社の opening は notFound）
  const [ownedOpening] = await db
    .select()
    .from(opening)
    .where(and(eq(opening.id, openingId), eq(opening.companyId, companyId)))
    .limit(1);

  if (!ownedOpening) notFound();

  // エントリー一覧取得
  const entries = await getEntriesByOpeningId(openingId);

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
          <span className="text-ink">エントリー</span>
        </nav>

        {/* ヘッダ */}
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-ink">エントリー一覧</h1>
          <p className="text-sm text-body">
            {ownedOpening.title} への応募者を確認・管理します。
          </p>
        </div>

        {/* エントリーテーブル */}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-hairline bg-card py-16 text-center">
            <p className="text-sm text-body">まだエントリーはありません</p>
            <p className="text-xs text-muted">
              候補者が招待リンクからエントリーを確定すると、ここに表示されます。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline bg-sidebar text-[11px] font-medium uppercase tracking-wider text-muted">
                    <th className="px-6 py-4 font-medium">候補者名</th>
                    <th className="px-6 py-4 font-medium">ステータス</th>
                    <th className="px-6 py-4 font-medium">エントリー日時</th>
                    <th className="w-24 px-6 py-4 text-right font-medium">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline text-sm">
                  {entries.map(({ entry, candidateProfile }) => (
                    <tr key={entry.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nav-active text-sm font-medium text-nav-active-ink">
                            {candidateProfile.displayName.charAt(0)}
                          </span>
                          <span className="font-medium text-ink">
                            {candidateProfile.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge tone={ENTRY_STATUS_TONE[entry.status]}>
                          {ENTRY_STATUS_LABEL[entry.status]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 tabular-nums text-body">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/openings/${openingId}/entries/${entry.id}`}
                          className="text-sm font-medium text-copper hover:underline"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* フッター */}
            <div className="flex items-center justify-between border-t border-hairline px-6 py-4">
              <span className="text-sm text-body">
                全{entries.length}件中 1-{entries.length}件を表示
              </span>
              <div className="flex items-center gap-1 text-muted">
                <button
                  type="button"
                  disabled
                  className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-canvas disabled:opacity-40"
                  aria-label="前のページ"
                >
                  <Icon name="chevron_left" size={20} />
                </button>
                <button
                  type="button"
                  disabled
                  className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-canvas disabled:opacity-40"
                  aria-label="次のページ"
                >
                  <Icon name="chevron_right" size={20} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * 募集一覧ページ（Server Component）
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { opening } from '@bulr/db/schema';
import { requireCompanyUser, AuthError } from '@bulr/auth/server';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';

// ---------------------------------------------------------------------------
// ステータスラベルマッピング
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  open: '公開中',
  closed: '終了',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'muted',
};

// ---------------------------------------------------------------------------
// 日時フォーマット
// ---------------------------------------------------------------------------

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OpeningsPage() {
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

  const openings = await db
    .select()
    .from(opening)
    .where(eq(opening.companyId, companyId))
    .orderBy(desc(opening.createdAt));

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-[1280px]">
        {/* ヘッダー */}
        <div className="mb-10 flex items-end justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">募集</h1>
          <Link
            href="/openings/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-soft"
          >
            <Icon name="add" size={18} />
            新規募集を作成
          </Link>
        </div>

        {/* 一覧 */}
        {openings.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-card px-8 py-16 text-center">
            <p className="text-body">まだ募集がありません。</p>
            <Link
              href="/openings/new"
              className="mt-4 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-soft"
            >
              最初の募集を作成する
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline bg-card">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-sidebar text-[11px] font-medium uppercase tracking-wider text-muted">
                  <th className="px-6 py-4 font-medium">タイトル</th>
                  <th className="px-6 py-4 font-medium">ステータス</th>
                  <th className="px-6 py-4 font-medium">作成日</th>
                  <th className="w-24 px-6 py-4 text-right font-medium">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-sm">
                {openings.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-canvas">
                    <td className="px-6 py-4 font-medium text-ink">{o.title}</td>
                    <td className="px-6 py-4">
                      <Badge tone={STATUS_TONE[o.status] ?? 'neutral'} dot={o.status === 'open'}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 tabular-nums text-body">{formatDate(o.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/openings/${o.id}`}
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
        )}
      </div>
    </main>
  );
}

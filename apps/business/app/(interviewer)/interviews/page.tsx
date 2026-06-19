/**
 * 面接セッション一覧ページ（Server Component）
 *
 * Requirements: 4.1-4.7, 20.5
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq, count, sql } from 'drizzle-orm';
import { db } from '@bulr/db';
import { interviewSession, interviewTurn, candidate, entry, opening, candidateProfile } from '@bulr/db/schema';
import { requireUser } from '@bulr/auth/server';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';

// ---------------------------------------------------------------------------
// ステータスラベルマッピング
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  in_progress: '進行中',
  completed: '完了',
  abandoned: '中断',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'warning',
  completed: 'success',
  abandoned: 'muted',
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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InterviewsPage() {
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    redirect('/sign-in');
  }

  // セッション一覧と候補者情報を JOIN で取得
  // Stage 1: candidate_id NOT NULL → candidate から名前・職種を取得
  // Stage 2: entry_id NOT NULL, candidate_id NULL → entry → opening / candidateProfile から取得
  const rows = await db
    .select({
      session: interviewSession,
      // Stage 2 (entry 経由) は candidateProfile.displayName を優先、Stage 1 は candidate.name
      candidateName: sql<string>`COALESCE(${candidateProfile.displayName}, ${candidate.name}, '—')`,
      // Stage 2 は opening.title を優先、Stage 1 は candidate.applied_role
      appliedRole: sql<string>`COALESCE(${opening.title}, ${candidate.applied_role}, '—')`,
    })
    .from(interviewSession)
    // candidate_id は Stage 2 で NULL → LEFT JOIN
    .leftJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
    // entry 経由セッション用 LEFT JOIN
    .leftJoin(entry, eq(interviewSession.entry_id, entry.id))
    .leftJoin(opening, eq(entry.openingId, opening.id))
    .leftJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
    .where(eq(interviewSession.interviewer_id, user.id))
    .orderBy(desc(interviewSession.created_at));

  // ターン数を session_id でグループ化して取得
  const turnCounts = await db
    .select({ sessionId: interviewTurn.session_id, count: count() })
    .from(interviewTurn)
    .groupBy(interviewTurn.session_id);

  // Map に変換して O(1) ルックアップ
  const turnCountMap = new Map<string, number>(
    turnCounts.map(({ sessionId, count }) => [sessionId, count]),
  );

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-[1280px]">
        {/* ヘッダー */}
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-ink">面接セッション</h1>
            <p className="text-sm text-body">現在の面接セッションの進行状況を管理します。</p>
          </div>
          <Link
            href="/interviews/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-soft"
          >
            <Icon name="add" size={18} />
            新規面接セッション作成
          </Link>
        </div>

        {/* セッション一覧 */}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-card px-8 py-16 text-center">
            <p className="mb-4 text-body">まだ面接セッションがありません。</p>
            <Link
              href="/interviews/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-soft"
            >
              新規面接セッションを作成
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline bg-sidebar text-[11px] font-medium uppercase tracking-wider text-muted">
                    <th className="px-6 py-4 font-medium">候補者名</th>
                    <th className="px-6 py-4 font-medium">応募職種</th>
                    <th className="px-6 py-4 font-medium">ステータス</th>
                    <th className="px-6 py-4 font-medium">開始日時</th>
                    <th className="px-6 py-4 font-medium">完了日時</th>
                    <th className="px-6 py-4 text-right font-medium">ターン数</th>
                    <th className="w-28 px-6 py-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline text-sm">
                  {rows.map(({ session, candidateName, appliedRole }) => {
                    const turns = turnCountMap.get(session.id) ?? 0;
                    const href =
                      session.status === 'completed'
                        ? `/interviews/${session.id}/report`
                        : `/interviews/${session.id}`;

                    return (
                      <tr key={session.id} className="transition-colors hover:bg-canvas">
                        <td className="px-6 py-4 font-medium text-ink">{candidateName}</td>
                        <td className="px-6 py-4 text-body">{appliedRole}</td>
                        <td className="px-6 py-4">
                          <Badge tone={STATUS_TONE[session.status] ?? 'neutral'}>
                            {STATUS_LABEL[session.status] ?? session.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 tabular-nums text-body">
                          {formatDate(session.started_at)}
                        </td>
                        <td className="px-6 py-4 tabular-nums text-body">
                          {formatDate(session.completed_at)}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-body">{turns}</td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={href}
                            className="text-sm font-medium text-copper hover:underline"
                          >
                            {session.status === 'completed' ? 'レポート' : '開く'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* フッター */}
            <div className="flex items-center justify-between border-t border-hairline px-6 py-4">
              <span className="text-sm text-body">
                全{rows.length}件中 1-{rows.length}件を表示
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

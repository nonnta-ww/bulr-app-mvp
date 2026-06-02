/**
 * 面接セッション一覧ページ（Server Component）
 *
 * Requirements: 4.1-4.7, 20.5
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq, count } from 'drizzle-orm';
import { db } from '@bulr/db';
import { interviewSession, interviewTurn, candidate } from '@bulr/db/schema';
import { requireUser } from '@bulr/auth/server';

// ---------------------------------------------------------------------------
// ステータスラベルマッピング
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  in_progress: '進行中',
  completed: '完了',
  abandoned: '中断',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  abandoned: 'bg-red-100 text-red-600',
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
  const rows = await db
    .select({
      session: interviewSession,
      candidate: candidate,
    })
    .from(interviewSession)
    .innerJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
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
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">面接セッション一覧</h1>
        </div>

        {/* セッション一覧 */}
        {rows.length === 0 ? (
          <div className="rounded-xl bg-white px-8 py-16 text-center shadow-sm">
            <p className="text-gray-500">まだ面接セッションがありません。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">候補者名</th>
                  <th className="px-4 py-3 font-medium text-gray-600">応募職種</th>
                  <th className="px-4 py-3 font-medium text-gray-600">ステータス</th>
                  <th className="px-4 py-3 font-medium text-gray-600">開始日時</th>
                  <th className="px-4 py-3 font-medium text-gray-600">完了日時</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ターン数</th>
                  <th className="px-4 py-3 font-medium text-gray-600">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ session, candidate: cand }) => {
                  const turns = turnCountMap.get(session.id) ?? 0;
                  const href =
                    session.status === 'completed'
                      ? `/interviews/${session.id}/report`
                      : `/interviews/${session.id}`;

                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{cand.name}</td>
                      <td className="px-4 py-3 text-gray-600">{cand.applied_role}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[session.status] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {STATUS_LABEL[session.status] ?? session.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(session.started_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(session.completed_at)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{turns}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={href}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {session.status === 'completed' ? 'レポートを見る' : '開く'}
                        </Link>
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

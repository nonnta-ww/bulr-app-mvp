/**
 * 面接レポートページ（Server Component）
 *
 * セッション終了後に生成されたレポートを表示する。
 * ヒートマップとAIサマリーテキストを含む。
 *
 * Requirements: 11.9, 11.10, 11.11, 11.12, 11.13, 11.14, 12.6, 20.5
 */

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { interviewSession, sessionReport } from '@bulr/db/schema';
import { requireUser } from '@/lib/guards';
import { Heatmap } from '../../_components/heatmap';
import ReactMarkdown from 'react-markdown';

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
// Props
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ sessionId: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ReportPage({ params }: Props) {
  const { sessionId } = await params;

  // 認証チェック
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    redirect('/sign-in');
  }

  // セッション取得 & 所有権確認
  const session = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });

  if (!session || session.interviewer_id !== user.id) {
    notFound();
  }

  // レポート取得
  const report = await db.query.sessionReport.findFirst({
    where: eq(sessionReport.session_id, sessionId),
  });

  // レポート未生成時のフォールバック
  if (!report) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl bg-white px-8 py-16 text-center shadow-sm">
            <p className="text-gray-600">
              レポートはまだ生成されていません。面接終了ボタンを押してください。
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* ページヘッダー */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">面接レポート</h1>
          <p className="mt-1 text-sm text-gray-500">
            生成日時：{formatDate(report.generated_at)}
          </p>
        </div>

        {/* ヒートマップ */}
        <Heatmap heatmapData={report.heatmap_data} />

        {/* AIサマリー */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">AIサマリー</h2>
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown>{report.summary_text}</ReactMarkdown>
          </div>
        </section>

        {/* フリー質問数（補足情報） */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">補足情報</h2>
          <p className="text-sm text-gray-600">
            フリー質問数：
            <span className="ml-1 font-mono font-semibold text-gray-900">
              {report.heatmap_data.free_question_count}
            </span>
          </p>
        </section>
      </div>
    </main>
  );
}

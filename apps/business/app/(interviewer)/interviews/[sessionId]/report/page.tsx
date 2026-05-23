/**
 * 面接レポートページ（Server Component）
 *
 * v2 (2026-05-18 redesign):
 * - 新ヒートマップ（スティッキー判定 + 観察/カバレッジタブ + ドリルダウン）
 * - 旧「補足情報」セクションは削除（フリー質問数はスティッキーに統合済み）
 */

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@bulr/db';
import { interviewSession } from '@bulr/db/schema';
import ReactMarkdown from 'react-markdown';

import { requireUser } from '@bulr/auth';
import { getReportData } from '@/lib/queries/get-report-data';
import { ReportView } from '../../_components/report/report-view';

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

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function ReportPage({ params }: Props) {
  const { sessionId } = await params;

  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    redirect('/sign-in');
  }

  const session = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });

  if (!session || session.interviewer_id !== user.id) {
    notFound();
  }

  const { report, allTurns, allPatterns } = await getReportData(sessionId);

  if (!report) {
    return (
      <main className="bg-gray-50 px-4 py-8">
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
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">面接レポート</h1>
          <p className="mt-1 text-sm text-gray-500">
            生成日時：{formatDate(report.generated_at)}
          </p>
        </div>

        <ReportView
          heatmapData={report.heatmap_data}
          allPatterns={allPatterns}
          allTurns={allTurns}
        />

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">AIサマリー</h2>
          <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1 prose-ul:my-2 prose-li:my-0.5">
            <ReactMarkdown>{report.summary_text}</ReactMarkdown>
          </div>
        </section>
      </div>
    </main>
  );
}

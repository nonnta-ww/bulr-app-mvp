/**
 * 面接レポートページ（Server Component）
 *
 * v2 (2026-05-18 redesign):
 * - 新ヒートマップ（スティッキー判定 + 観察/カバレッジタブ + ドリルダウン）
 * - 旧「補足情報」セクションは削除（フリー質問数はスティッキーに統合済み）
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db, getInterviewSession } from '@bulr/db';
import { interviewSession, transcriptSegment } from '@bulr/db/schema';
import type { TranscriptSegmentData } from '../../_components/report/transcript-tab';
import ReactMarkdown from 'react-markdown';

import { requireUser } from '@bulr/auth/server';
import { getReportData } from '@/lib/queries/get-report-data';
import { ReportView } from '../../_components/report/report-view';
import { EntryContextSection } from './_components/entry-context-section';

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

  const rawSession = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });

  if (!rawSession || rawSession.interviewer_id !== user.id) {
    notFound();
  }

  const [{ report, allTurns, allPatterns }, sessionResult, rawSegments] = await Promise.all([
    getReportData(sessionId),
    getInterviewSession(sessionId),
    // transcript_segment を時系列順（started_at_ms 昇順、タイブレーク seq 昇順）で取得
    // 所有者ゲートは上記の interviewer_id チェック済みのため追加アクセス制御は不要
    // 管理者向けアクセスは別アプリ（apps/admin）で提供（本境界外）
    db
      .select({
        seq: transcriptSegment.seq,
        speakerRole: transcriptSegment.speaker_role,
        speakerLabel: transcriptSegment.speaker_label,
        text: transcriptSegment.text,
        startedAtMs: transcriptSegment.started_at_ms,
      })
      .from(transcriptSegment)
      .where(eq(transcriptSegment.session_id, sessionId))
      .orderBy(asc(transcriptSegment.started_at_ms), asc(transcriptSegment.seq)),
  ]);

  const transcriptSegments: TranscriptSegmentData[] = rawSegments;

  if (!sessionResult) {
    notFound();
  }

  if (!report) {
    return (
      <main className="px-6 py-8 md:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-hairline bg-card px-8 py-16 text-center">
            <p className="text-body">
              レポートはまだ生成されていません。面接終了ボタンを押してください。
            </p>
          </div>
        </div>
      </main>
    );
  }

  const candidateName =
    sessionResult.kind === 'stage2'
      ? sessionResult.candidateProfile.displayName
      : sessionResult.candidate.name;

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* パンくず */}
        <nav className="flex items-center gap-2 text-sm text-muted">
          <Link href="/interviews" className="hover:text-ink">
            面接セッション
          </Link>
          <span className="text-hairline-strong">/</span>
          <span className="text-body">{candidateName}</span>
          <span className="text-hairline-strong">/</span>
          <span className="text-ink">レポート</span>
        </nav>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">面接レポート</h1>
          <p className="mt-1 text-sm text-muted">
            生成日時：{formatDate(report.generated_at)}
          </p>
        </div>

        <EntryContextSection session={sessionResult} />

        <ReportView
          heatmapData={report.heatmap_data}
          allPatterns={allPatterns}
          allTurns={allTurns}
          transcriptSegments={transcriptSegments}
        />

        <section className="rounded-xl border border-hairline bg-card p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">AI サマリー</h2>
          <div className="prose prose-sm max-w-none text-body prose-headings:text-ink prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1 prose-ul:my-2 prose-li:my-0.5">
            <ReactMarkdown>{report.summary_text}</ReactMarkdown>
          </div>
        </section>
      </div>
    </main>
  );
}

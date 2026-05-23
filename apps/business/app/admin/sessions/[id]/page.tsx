/**
 * 管理画面 セッション詳細ページ（/admin/sessions/[id]）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * sessionDetailQuery でデータを取得し、各サブコンポーネントに渡して描画する。
 *
 * Requirements: 4.1, 4.2, 4.5, 4.8, 4.9, 4.10, 4.11, 10.2, 13.1, 13.2
 * Boundary: SessionDetailPage (this file only)
 * Depends: 5.1 ✓ (ProfileDisplay), 5.2 ✓ (InterviewerDisplay),
 *          5.4 ✓ (ChatMessageTimeline), 5.5 ✓ (AnswerCard), 5.6 ✓ (ReportLink)
 */

import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { AnswerCard } from '@/app/admin/_components/answer-card';
import { ChatMessageTimeline } from '@/app/admin/_components/chat-message-timeline';
import { InterviewerDisplay } from '@/app/admin/_components/interviewer-display';
import { ProfileDisplay } from '@/app/admin/_components/profile-display';
import { ReportLink } from '@/app/admin/_components/report-link';
import { AuthError, requireAdmin } from '@bulr/auth';
import { sessionDetailQuery } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: params は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** ISO 8601 の Date を「YYYY-MM-DD HH:mm:ss」形式に整形する（JST）。null の場合は「—」を返す。 */
function formatTimestamp(value: Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '—';

  const formatted = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);

  // ja-JP は「2024/01/15 09:30:00」形式を返すためスラッシュをハイフンに変換
  return formatted.replace(/\//g, '-');
}

/** 2 つの Date の差分をミリ秒で求め「X分 YY秒」または「X秒」形式に整形する。 */
function formatSessionDuration(
  startedAt: Date | null | undefined,
  completedAt: Date | null | undefined,
): string {
  if (!startedAt || !completedAt) return '—';
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
  }
  return `${totalSeconds}秒`;
}

/** 定義リスト行（ラベル + 値） */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[14rem_1fr] gap-2 py-1.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function SessionDetailPage({ params }: PageProps) {
  // Layer 2 多層防御: 未認証・非管理者は弾く
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        redirect('/sign-in');
      }
      if (err.code === 'FORBIDDEN') {
        notFound();
      }
    }
    // その他のエラーは上位に再スロー
    throw err;
  }

  // params のアンラップ（Next.js 16: async）
  const { id } = await params;

  // id バリデーション
  const idSchema = z.string().min(1);
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    notFound();
  }

  // DBクエリ
  const detail = await sessionDetailQuery(parsed.data);
  if (detail === null) {
    notFound();
  }

  // patternCodeByPatternId マップの構築
  const patternCodeByPatternId = new Map(
    detail.coverages.map((c) => [c.pattern.id, c.pattern.code]),
  );

  // セッションメタ情報の計算
  const { session, candidate, interviewer, turns, coverages } = detail;
  const freeQuestionCount = turns.filter((t) => t.pattern_id === null).length;

  // ProfileDisplay が期待する CandidateInfo 形式に変換
  const candidateInfo = {
    name: candidate.name,
    appliedRole: candidate.applied_role,
    backgroundSummary: candidate.background_summary,
    ...(candidate.email !== null && candidate.email !== undefined
      ? { email: candidate.email }
      : {}),
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* セクションタイトル */}
      <h1 className="text-2xl font-bold text-gray-900">セッション詳細</h1>

      {/* 候補者情報 */}
      <ProfileDisplay candidate={candidateInfo} />

      {/* 面接官情報 */}
      <InterviewerDisplay interviewer={interviewer} />

      {/* セッションメタ情報 */}
      <section aria-labelledby="session-meta-heading">
        <h2
          id="session-meta-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          セッション情報
        </h2>
        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
          <Term label="ステータス">{session.status}</Term>
          <Term label="開始日時">{formatTimestamp(session.started_at)}</Term>
          <Term label="完了日時">{formatTimestamp(session.completed_at)}</Term>
          <Term label="所要時間">
            {formatSessionDuration(session.started_at, session.completed_at)}
          </Term>
          <Term label="ターン数">{turns.length}</Term>
          <Term label="coverage 数">{coverages.length}</Term>
          <Term label="フリー質問数">{freeQuestionCount}</Term>
          <Term label="planned_pattern_codes">
            {session.planned_pattern_codes.join(', ') || '—'}
          </Term>
          <Term label="同意取得日時">{formatTimestamp(session.consent_obtained_at)}</Term>
          <Term label="同意バージョン">{session.consent_version}</Term>
        </dl>
      </section>

      {/* インタビュー時系列 */}
      <ChatMessageTimeline
        turns={turns}
        patternCodeByPatternId={patternCodeByPatternId}
      />

      {/* パターン回答カード */}
      {coverages.map((c) => (
        <AnswerCard key={c.id} coverage={c} />
      ))}

      {/* レポートリンク */}
      <div>
        <ReportLink sessionId={session.id} />
      </div>
    </main>
  );
}

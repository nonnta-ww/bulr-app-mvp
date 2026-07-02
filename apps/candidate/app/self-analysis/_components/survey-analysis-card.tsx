/**
 * SurveyAnalysisCard — 自己分析一覧の1カード（presentational Server Component）
 *
 * 回答済みアンケート1件を、最新回答日・分析ステータスバッジ・遷移ボタンで表示する。
 * ボタンは詳細ページ /self-analysis/[surveyId] への Link。生成自体は詳細ページ側に委譲。
 */

import Link from 'next/link';

import type { AnsweredSurveySummary } from '@bulr/db';

const STATUS_BADGE: Record<
  AnsweredSurveySummary['analysisStatus'],
  { label: string; className: string }
> = {
  none: { label: '未生成', className: 'bg-surface-2 text-muted' },
  ready: { label: '生成済み', className: 'bg-emerald-100 text-emerald-800' },
  stale: { label: '要再生成', className: 'bg-primary/15 text-[#8f4d00]' },
};

const BUTTON_LABEL: Record<AnsweredSurveySummary['analysisStatus'], string> = {
  none: '自己分析を生成する',
  ready: '分析を見る',
  stale: '分析を見る',
};

export function SurveyAnalysisCard({ summary }: { summary: AnsweredSurveySummary }) {
  const badge = STATUS_BADGE[summary.analysisStatus];
  const submitted = summary.latestSubmittedAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <Link
      href={`/self-analysis/${summary.surveyId}`}
      className="group block rounded-card border border-hairline bg-card p-6 shadow-ambient transition-colors hover:border-slate hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-ink">{summary.title}</h2>
          <p className="mt-1 text-xs text-muted">最終回答日: {submitted}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate transition-transform group-hover:translate-x-1">
          {BUTTON_LABEL[summary.analysisStatus]}
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_forward
          </span>
        </span>
      </div>
    </Link>
  );
}

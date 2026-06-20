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
  none: { label: '未生成', className: 'bg-gray-100 text-gray-600' },
  ready: { label: '生成済み', className: 'bg-emerald-100 text-emerald-800' },
  stale: { label: '要再生成', className: 'bg-amber-100 text-amber-800' },
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
      className="block rounded-lg border border-gray-200 p-5 transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">{summary.title}</h2>
          <p className="mt-1 text-xs text-gray-500">最終回答日: {submitted}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
          {BUTTON_LABEL[summary.analysisStatus]} →
        </span>
      </div>
    </Link>
  );
}

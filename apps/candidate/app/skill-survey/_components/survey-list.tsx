/**
 * SurveyList — スキルアンケート一覧コンポーネント（Server Component）
 *
 * - アクティブな survey を Zenith デザインのカードグリッドで一覧表示する
 * - 各カードは /skill-survey/{id} へのリンクを持つ
 * - jobType からカテゴリタグを表示する
 * - 本人の診断統計（最終診断日・診断回数）があれば「回答済」バッジ + 更新導線、
 *   なければ「回答する」導線を表示する
 * - survey が 0 件の場合は空状態メッセージを表示する
 *
 * Requirements: 4.1, 7.1
 */

import Link from 'next/link';

import type { SkillSurvey } from '@bulr/db/schema';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** survey 単位の診断統計（page.tsx が self_analysis 集計から構築） */
export interface SurveyStats {
  diagnosisCount: number;
  lastDiagnosedAt: Date;
}

interface Props {
  surveys: SkillSurvey[];
  /** surveyId → 診断統計。診断がない survey はキーを持たない。 */
  statsBySurveyId?: Record<string, SurveyStats>;
}

// ---------------------------------------------------------------------------
// jobType → カテゴリタグ（日本語）
// ---------------------------------------------------------------------------

/** 既知の jobType を短いカテゴリ表記に変換。未知の場合は jobType をそのまま表示。 */
const JOB_TYPE_LABELS: Record<string, string> = {
  backend: 'バックエンド',
  frontend: 'フロントエンド',
  'infrastructure-sre': 'インフラ・SRE',
  'engineering-manager': 'エンジニアリングマネージャー',
  mobile: 'モバイル',
  data: 'データ',
  'ai-driven-development': 'AI駆動開発',
};

function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function SurveyList({ surveys, statsBySurveyId = {} }: Props) {
  if (surveys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-card px-6 py-12 text-center">
        <span className="material-symbols-outlined mb-2 text-[32px] text-slate opacity-60" aria-hidden="true">
          inbox
        </span>
        <p className="text-sm text-muted">アンケートがまだ準備されていません。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {surveys.map((survey) => {
        const stats = statsBySurveyId[survey.id];
        const answered = Boolean(stats);

        return (
          <Link
            key={survey.id}
            href={`/skill-survey/${survey.id}`}
            className="group flex h-full flex-col rounded-card border border-hairline bg-card p-6 shadow-ambient transition-colors hover:border-slate hover:bg-surface-2"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                {jobTypeLabel(survey.jobType)}
              </span>
              {answered && (
                <span className="rounded bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                  回答済
                </span>
              )}
            </div>

            <h2 className="mb-3 text-xl font-bold text-ink">{survey.title}</h2>
            {survey.description && (
              <p className="mb-8 flex-1 text-sm leading-relaxed text-muted">{survey.description}</p>
            )}

            <div className="mt-auto flex items-center justify-between gap-2">
              {answered && stats ? (
                <span className="text-xs text-muted">
                  最終回答:{' '}
                  {stats.lastDiagnosedAt.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                  <span className="mx-1.5 text-hairline">·</span>
                  {stats.diagnosisCount}回
                </span>
              ) : (
                <span aria-hidden="true" />
              )}
              <span className="flex items-center gap-1 text-sm font-medium text-slate transition-transform group-hover:translate-x-1">
                {answered ? '更新する' : '回答する'}
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

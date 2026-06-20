/**
 * SurveyList — スキルアンケート一覧コンポーネント（Server Component）
 *
 * - アクティブな survey をカード形式で一覧表示する
 * - 各カードは /skill-survey/{id} へのリンクを持つ
 * - 本人の診断統計（最終診断日・診断回数）があればカードに表示する
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
// コンポーネント
// ---------------------------------------------------------------------------

export function SurveyList({ surveys, statsBySurveyId = {} }: Props) {
  if (surveys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
        <p className="text-sm text-gray-600">アンケートがまだ準備されていません。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {surveys.map((survey) => {
        const stats = statsBySurveyId[survey.id];

        return (
          <li key={survey.id}>
            <Link
              href={`/skill-survey/${survey.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <h2 className="text-base font-semibold text-gray-900">{survey.title}</h2>
              {survey.description && (
                <p className="mt-1 text-sm text-gray-600">{survey.description}</p>
              )}

              {/* 診断統計（最終診断日・診断回数）。未診断のときは控えめに表示。 */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                {stats ? (
                  <>
                    <span>
                      最終診断日:{' '}
                      <span className="font-medium text-gray-700">
                        {stats.lastDiagnosedAt.toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </span>
                    </span>
                    <span>
                      診断回数:{' '}
                      <span className="font-medium text-gray-700">{stats.diagnosisCount}回</span>
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">まだ診断していません</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

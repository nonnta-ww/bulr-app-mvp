/**
 * SurveyList — スキルアンケート一覧コンポーネント（Server Component）
 *
 * - アクティブな survey をカード形式で一覧表示する
 * - 各カードは /skill-survey/{id} へのリンクを持つ
 * - survey が 0 件の場合は空状態メッセージを表示する
 *
 * Requirements: 4.1, 7.1
 */

import Link from 'next/link';

import type { SkillSurvey } from '@bulr/db/schema';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

interface Props {
  surveys: SkillSurvey[];
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function SurveyList({ surveys }: Props) {
  if (surveys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
        <p className="text-sm text-gray-600">アンケートがまだ準備されていません。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {surveys.map((survey) => (
        <li key={survey.id}>
          <Link
            href={`/skill-survey/${survey.id}`}
            className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <h2 className="text-base font-semibold text-gray-900">{survey.title}</h2>
            {survey.description && (
              <p className="mt-1 text-sm text-gray-600">{survey.description}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

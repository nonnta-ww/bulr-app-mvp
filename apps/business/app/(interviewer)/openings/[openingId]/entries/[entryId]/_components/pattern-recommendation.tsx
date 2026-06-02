/**
 * PatternRecommendation — パターン推奨 Server Component
 *
 * スキルアンケート回答と assessment_pattern のキーワードマッチング結果を
 * 「参考ヒント」として表示する。
 *
 * - props: { skillSurveyResponse: SkillSurveyResponseWithAnswers | null, patterns: AssessmentPattern[] }
 * - skillSurveyResponse が null の場合は「スキルアンケート未回答」メッセージを表示する
 * - matchPatterns の結果をスコア降順で最大 10 件表示する
 * - 推奨はあくまで「ヒント」であることを UI 上で明示する（自動決定は行わない）
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import type { AssessmentPattern } from '@bulr/db/schema';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db';

import { matchPatterns } from '../_lib/pattern-matching';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  skillSurveyResponse: SkillSurveyResponseWithAnswers | null;
  patterns: AssessmentPattern[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatternRecommendation({ skillSurveyResponse, patterns }: Props) {
  // スキルアンケート未回答の場合（要件 3.4）
  if (skillSurveyResponse === null) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">推奨パターン（参考）</h2>
        <p className="mb-4 text-sm text-gray-500">
          スキルアンケートの回答に基づき、関連する面接パターンを参考情報として提示します。
        </p>
        <p className="text-sm text-gray-400">
          スキルアンケート未回答のため推奨パターンを表示できません
        </p>
      </div>
    );
  }

  // パターンマッチング実行（matchPatterns はスコア降順で返す）
  const matches = matchPatterns(skillSurveyResponse, patterns).slice(0, 10);

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      {/* セクションヘッダー */}
      <div className="mb-4">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">推奨パターン（参考）</h2>
        <p className="text-sm text-gray-500">
          スキルアンケートの回答に基づき、関連する可能性のある面接パターンを提示します。
          以下のパターンがスキルアンケートに関連している可能性があります。
          推奨はあくまでヒントであり、最終的なパターン選択は面接官が判断してください。
        </p>
      </div>

      {/* マッチング結果なし */}
      {matches.length === 0 ? (
        <p className="text-sm text-gray-400">
          スキルアンケートの回答に関連するパターンが見つかりませんでした。
        </p>
      ) : (
        <ul className="space-y-3">
          {matches.map((match) => (
            <li
              key={match.patternCode}
              className="rounded-lg border border-gray-200 p-4"
            >
              {/* パターン名 + カテゴリ */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {match.patternTitle}
                </span>
                <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {match.patternCategory}
                </span>
              </div>

              {/* マッチしたキーワード */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-500">マッチしたキーワード：</span>
                {match.matchedKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

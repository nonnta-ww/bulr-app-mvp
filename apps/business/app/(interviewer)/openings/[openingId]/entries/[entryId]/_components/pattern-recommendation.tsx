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
      <div className="rounded-xl border border-copper/30 bg-copper-soft/50 p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-copper" style={{ fontSize: 20 }}>
            lightbulb
          </span>
          <h2 className="text-base font-semibold text-ink">推奨パターン</h2>
        </div>
        <p className="text-sm text-body">
          スキルアンケート未回答のため推奨パターンを表示できません。
        </p>
      </div>
    );
  }

  // パターンマッチング実行（matchPatterns はスコア降順で返す）
  const matches = matchPatterns(skillSurveyResponse, patterns).slice(0, 10);

  return (
    <div className="rounded-xl border border-copper/30 bg-copper-soft/50 p-6">
      {/* セクションヘッダー */}
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-copper" style={{ fontSize: 20 }}>
            lightbulb
          </span>
          <h2 className="text-base font-semibold text-ink">推奨パターン</h2>
        </div>
        <p className="text-xs leading-relaxed text-body">
          アンケート回答に基づくヒントです。最終的なパターン選択は面接官が判断してください。
        </p>
      </div>

      {/* マッチング結果なし */}
      {matches.length === 0 ? (
        <p className="text-sm text-body">関連するパターンが見つかりませんでした。</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((match) => (
            <li
              key={match.patternCode}
              className="rounded-lg border border-copper/20 bg-card/70 p-3"
            >
              {/* パターン名 + カテゴリ */}
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-copper">{match.patternCode}</span>
                <span className="text-sm font-medium text-ink">{match.patternTitle}</span>
              </div>

              {/* マッチしたキーワード */}
              <div className="flex flex-wrap items-center gap-1.5">
                {match.matchedKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-block rounded bg-copper-soft px-1.5 py-0.5 text-[11px] text-copper"
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

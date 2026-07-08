/**
 * answers.ts — 思考スタイルアンケート回答 → 軸マッピング（seed 契約の単一ソース, task 1.3）。
 *
 * 思考スタイルアンケート（SurveyResponseForAnalysis）のカテゴリ名を思考スタイル4軸
 * （ThinkingStyleAxis）へ写像し、scoreThinkingStyle の入力 ThinkingStyleAnswer[] を
 * 決定論的に組み立てる。気質（temperament/answers.ts）と同型の additive mirror。
 *
 * カテゴリ名（THINKING_STYLE_CATEGORY_AXIS のキー）は seed（task 3.1）が固定する安定契約キーであり、
 * seed が「stored level が高いほど第2極（具体/直感/発散/実践先行）寄り」に正規化済みのため reverse は
 * 常に false、maxLevel は定数 4（0..4 の 5 段階）で渡す（R5.2/R5.3・design.md「app core → 回答マッピング」）。
 *
 * DB/LLM/auth に一切依存しない純関数。同一入力 → 同一出力。
 */

import type { SurveyResponseForAnalysis } from '@bulr/db';

import type { ThinkingStyleAxis } from './axes';
import type { ThinkingStyleAnswer } from './score';

/**
 * 思考スタイル seed（task 3.1）のカテゴリ名 → 思考スタイル軸の対応（seed 契約の単一ソース）。
 * カテゴリ名は seed 側で安定キーとして固定されている。task 3.1 が seed するカテゴリ名と厳密一致させること。
 */
export const THINKING_STYLE_CATEGORY_AXIS: Record<string, ThinkingStyleAxis> = {
  抽象と具体: 'abstractConcrete',
  論理と直感: 'logicIntuition',
  収束と発散: 'convergentDivergent',
  理論と実践: 'theoryPractice',
};

/**
 * 思考スタイル Likert の最大 level（0..4 の 5 段階）。seed（task 3.1）と一致させること。
 */
export const THINKING_STYLE_MAX_LEVEL = 4;

/**
 * 思考スタイル回答束を scoreThinkingStyle の入力（ThinkingStyleAnswer[]）へ写像する。
 *
 * カテゴリ名が THINKING_STYLE_CATEGORY_AXIS に解決でき、かつ selectedLevels が非空の回答のみを対象に
 * `{ axis, level: selectedLevels[0], reverse: false, maxLevel: 4 }` を emit する。
 * seed が「高 level = 第2極寄り」に正規化済みのため reverse は常に false（R5.3 の向き契約）。
 * response が null / 対象回答なし → 空配列（→ scoreThinkingStyle が partial/none を返す）。
 */
export function mapThinkingStyleAnswers(
  response: SurveyResponseForAnalysis | null,
): ThinkingStyleAnswer[] {
  if (!response) {
    return [];
  }

  const result: ThinkingStyleAnswer[] = [];
  for (const category of response.categories) {
    const axis = THINKING_STYLE_CATEGORY_AXIS[category.categoryName];
    if (!axis) {
      continue;
    }
    for (const answer of category.answers) {
      const level = answer.selectedLevels[0];
      if (level === undefined) {
        continue;
      }
      result.push({
        axis,
        level,
        reverse: false,
        maxLevel: THINKING_STYLE_MAX_LEVEL,
      });
    }
  }
  return result;
}

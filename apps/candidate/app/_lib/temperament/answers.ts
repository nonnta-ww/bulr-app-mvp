/**
 * answers.ts — 気質アンケート回答 → 軸マッピング（seed 契約の単一ソース, task 1.4）。
 *
 * playstyle アンケート（SurveyResponseForAnalysis）のカテゴリ名を気質4軸（TemperamentAxis）へ
 * 写像し、scoreTemperament の入力 TemperamentAnswer[] を決定論的に組み立てる。
 *
 * カテゴリ名（PLAYSTYLE_CATEGORY_AXIS のキー）は seed（task 3.2）が固定する安定契約キーであり、
 * seed が「stored level が高いほど第2極寄り」に正規化済みのため reverse は常に false、maxLevel は
 * 定数 4（0..4 の 5 段階）で渡す（design.md「File Structure Plan > answers.ts」/「Components > db seed」）。
 *
 * DB/LLM/auth に一切依存しない純関数。同一入力 → 同一出力。
 */

import type { SurveyResponseForAnalysis } from '@bulr/db';
import type { TemperamentAxis } from '@bulr/types';

import type { TemperamentAnswer } from './score';

/**
 * playstyle seed（task 3.2）のカテゴリ名 → 気質軸の対応（seed 契約の単一ソース）。
 * カテゴリ名は seed 側で安定キーとして固定されている。task 3.2 が seed するカテゴリ名と厳密一致させること。
 */
export const PLAYSTYLE_CATEGORY_AXIS: Record<string, TemperamentAxis> = {
  探索と深化: 'explorationDeepening',
  個人と協調: 'soloCollaboration',
  計画と即興: 'planningImprovisation',
  堅実と挑戦: 'stabilityChallenge',
};

/**
 * playstyle Likert の最大 level（0..4 の 5 段階）。seed（task 3.2）と一致させること。
 */
export const PLAYSTYLE_MAX_LEVEL = 4;

/**
 * playstyle 回答束を scoreTemperament の入力（TemperamentAnswer[]）へ写像する。
 *
 * カテゴリ名が PLAYSTYLE_CATEGORY_AXIS に解決でき、かつ selectedLevels が非空の回答のみを対象に
 * `{ axis, level: selectedLevels[0], reverse: false, maxLevel: 4 }` を emit する。
 * seed が「高 level = 第2極寄り」に正規化済みのため reverse は常に false。
 * playstyle が null / 対象回答なし → 空配列（→ scoreTemperament が partial/none を返す）。
 */
export function mapTemperamentAnswers(
  playstyle: SurveyResponseForAnalysis | null,
): TemperamentAnswer[] {
  if (!playstyle) {
    return [];
  }

  const result: TemperamentAnswer[] = [];
  for (const category of playstyle.categories) {
    const axis = PLAYSTYLE_CATEGORY_AXIS[category.categoryName];
    if (!axis) {
      continue;
    }
    for (const answer of category.answers) {
      const level = answer.selectedLevels[0];
      if (level === undefined) {
        continue;
      }
      result.push({ axis, level, reverse: false, maxLevel: PLAYSTYLE_MAX_LEVEL });
    }
  }
  return result;
}

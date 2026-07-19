/**
 * answers.ts — チームワーク・スタイルアンケート回答 → 軸/成長ディメンション写像（seed 契約の単一ソース）。
 *
 * アンケート回答（SurveyResponseForAnalysis）のカテゴリ名を、レイヤー1の4軸（TeamworkAxis）と
 * レイヤー2の3成長ディメンション（GrowthDimension）へ写像し、scoreTeamworkStyle と
 * deriveGrowthAdvice の入力を決定論的に組み立てる。
 *
 * カテゴリ名（TEAMWORK_CATEGORY_AXIS / TEAMWORK_CATEGORY_DIMENSION のキー）は **本ファイルが単一ソース**で、
 * seed（task 3.1）はこの文字列に厳密一致させること（design.md「answers.ts」）。
 *
 * level エンコード（seed 契約）:
 *  - レイヤー1（二者択一）: choice.level = 第1極:0 / 第2極:1 → pickedHighPole = (level === 1)
 *  - レイヤー2（SJT）: choice.level = 発達段階 0..2 → GrowthAnswer.level
 *
 * DB/LLM/auth に一切依存しない純関数。同一入力 → 同一出力。未知カテゴリ・空回答は無視する。
 */

import type { SurveyResponseForAnalysis } from "@bulr/db";

import type { TeamworkAxis } from "./axes";
import type { GrowthAnswer, GrowthDimension } from "./growth";
import type { TeamworkAnswer } from "./score";

/**
 * レイヤー1: seed のカテゴリ名 → チームワーク軸（seed 契約の単一ソース）。
 * task 3.1 が seed するカテゴリ名と厳密一致させること。
 */
export const TEAMWORK_CATEGORY_AXIS: Record<string, TeamworkAxis> = {
  率直さ: "candor",
  判断の重心: "decisionFocus",
  距離感: "distance",
  異論への構え: "dissent",
};

/**
 * レイヤー2: seed のカテゴリ名 → 成長ディメンション（seed 契約の単一ソース）。
 * task 3.1 が seed する SJT カテゴリ名と厳密一致させること。
 */
export const TEAMWORK_CATEGORY_DIMENSION: Record<string, GrowthDimension> = {
  自己認識: "selfAwareness",
  他者視点の取得: "perspectiveTaking",
  感情の自己制御: "selfRegulation",
};

/** mapTeamworkAnswers の戻り値。scorer 入力（L1）と growth 入力（L2）を分けて返す。 */
export interface TeamworkMappedAnswers {
  styleAnswers: TeamworkAnswer[];
  growthAnswers: GrowthAnswer[];
}

/**
 * 回答束を scoreTeamworkStyle / deriveGrowthAdvice の入力へ写像する。
 *
 * - カテゴリ名が TEAMWORK_CATEGORY_AXIS に解決できる場合、各回答の selectedLevels[0] を極ピックへ変換
 *   （`{ axis, pickedHighPole: level === 1 }`）。
 * - カテゴリ名が TEAMWORK_CATEGORY_DIMENSION に解決できる場合、`{ dimension, level }` を emit。
 * - どちらにも解決できないカテゴリ、および selectedLevels が空の回答は無視する。
 * - response が null → 空の写像（→ scorer は none、growth は空）。
 */
export function mapTeamworkAnswers(
  response: SurveyResponseForAnalysis | null,
): TeamworkMappedAnswers {
  const styleAnswers: TeamworkAnswer[] = [];
  const growthAnswers: GrowthAnswer[] = [];

  if (!response) {
    return { styleAnswers, growthAnswers };
  }

  for (const category of response.categories) {
    const axis = TEAMWORK_CATEGORY_AXIS[category.categoryName];
    const dimension = TEAMWORK_CATEGORY_DIMENSION[category.categoryName];

    if (axis) {
      for (const answer of category.answers) {
        const level = answer.selectedLevels[0];
        if (level === undefined) {
          continue;
        }
        styleAnswers.push({ axis, pickedHighPole: level === 1 });
      }
    } else if (dimension) {
      for (const answer of category.answers) {
        const level = answer.selectedLevels[0];
        if (level === undefined) {
          continue;
        }
        growthAnswers.push({ dimension, level });
      }
    }
  }

  return { styleAnswers, growthAnswers };
}

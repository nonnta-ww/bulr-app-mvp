/**
 * worklife-disposition/answers.ts — 志向アンケート回答 → 志向マッピング。
 *
 * `worklife-disposition-survey`（SurveyResponseForAnalysis）のカテゴリ名を志向（DispositionKey）へ
 * 写像し、`scoreWorklifeDispositions` の入力 `WorklifeDispositionAnswer[]` を決定論的に組み立てる。
 *
 * seed は全設問 natural（肯定表現）・stored level が高いほど「その志向を強く重視する」に正規化済みの
 * ため reverse は無く、maxLevel は定数 4（0..4 の 5 段階 Likert）で渡す（design.md「answers.ts」）。
 *
 * DB/LLM/auth に一切依存しない純関数。同一入力 → 同一出力（spec: worklife-disposition-survey, R2.1）。
 *
 * Boundary: _lib/worklife-disposition/answers.ts
 */

import type { SurveyResponseForAnalysis } from "@bulr/db";

import type { DispositionKey } from "../archetype/dispositions";
import { WORKLIFE_DISPOSITION_CATEGORY_MAP } from "./category-map";

/**
 * 志向設問1問の回答。playstyle/thinking-style と同じ Likert 契約
 * （reverse なし・単一方向の肯定強度）。
 */
export interface WorklifeDispositionAnswer {
  disposition: DispositionKey;
  level: number; // 0..maxLevel（選択肢の level をそのまま使用）
  maxLevel: number; // 4（5段階 Likert）
}

/** 志向 Likert の最大 level（0..4 の 5 段階）。seed（worklife-disposition.ts）と一致させること。 */
export const WORKLIFE_DISPOSITION_MAX_LEVEL = 4;

/**
 * 志向アンケート回答束を `scoreWorklifeDispositions` の入力（WorklifeDispositionAnswer[]）へ写像する。
 *
 * カテゴリ名が `WORKLIFE_DISPOSITION_CATEGORY_MAP` に解決でき、かつ selectedLevels が非空の回答のみを
 * 対象に `{ disposition, level: selectedLevels[0], maxLevel: 4 }` を emit する。
 * response が null（未回答）／対象回答なし → 空配列（→ `scoreWorklifeDispositions` が `{}` を返す）。
 * 対応表に無いカテゴリは無視する（防御的）。
 */
export function mapWorklifeDispositionAnswers(
  response: SurveyResponseForAnalysis | null,
): WorklifeDispositionAnswer[] {
  if (!response) {
    return [];
  }

  const result: WorklifeDispositionAnswer[] = [];
  for (const category of response.categories) {
    const disposition = WORKLIFE_DISPOSITION_CATEGORY_MAP[category.categoryName];
    if (!disposition) {
      continue;
    }
    for (const answer of category.answers) {
      const level = answer.selectedLevels[0];
      if (level === undefined) {
        continue;
      }
      result.push({
        disposition,
        level,
        maxLevel: WORKLIFE_DISPOSITION_MAX_LEVEL,
      });
    }
  }
  return result;
}

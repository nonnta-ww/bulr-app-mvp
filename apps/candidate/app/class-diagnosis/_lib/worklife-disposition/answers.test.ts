import { describe, it, expect } from "vitest";
import type { SurveyResponseForAnalysis } from "@bulr/db";

import { mapWorklifeDispositionAnswers } from "./answers";

/** SurveyResponseForAnalysis の1回答を最小構築するヘルパ。 */
function answer(selectedLevels: number[]) {
  return {
    questionId: `q-${selectedLevels.join("-")}`,
    categoryName: "",
    questionBody: "設問",
    questionType: "single_choice" as const,
    scoringKind: "polarity" as const,
    selectedLabels: selectedLevels.map((l) => `label-${l}`),
    selectedLevels,
    freeText: null,
  };
}

function response(
  categories: Array<{ categoryName: string; levels: number[][] }>,
): SurveyResponseForAnalysis {
  return {
    surveyId: "survey-1",
    jobType: "worklife-disposition",
    responseId: "resp-1",
    submittedAt: new Date("2026-07-10T00:00:00Z"),
    categories: categories.map((c) => ({
      categoryName: c.categoryName,
      totalQuestions: c.levels.length,
      answers: c.levels.map((lv) => ({
        ...answer(lv),
        categoryName: c.categoryName,
      })),
    })),
  };
}

describe("mapWorklifeDispositionAnswers", () => {
  it("response=null（未回答）は空配列を返す (R2.1)", () => {
    expect(mapWorklifeDispositionAnswers(null)).toEqual([]);
  });

  it("カテゴリ名を DispositionKey へ写像する (R2.1)", () => {
    const result = mapWorklifeDispositionAnswers(
      response([
        { categoryName: "改善志向", levels: [[4]] },
        { categoryName: "障害対応志向", levels: [[2]] },
        { categoryName: "育成志向", levels: [[3]] },
        { categoryName: "調整・橋渡し志向", levels: [[1]] },
        { categoryName: "新技術採用志向", levels: [[0]] },
      ]),
    );
    expect(result).toEqual([
      { disposition: "improvement", level: 4, maxLevel: 4 },
      { disposition: "incident", level: 2, maxLevel: 4 },
      { disposition: "mentoring", level: 3, maxLevel: 4 },
      { disposition: "coordination", level: 1, maxLevel: 4 },
      { disposition: "newTech", level: 0, maxLevel: 4 },
    ]);
  });

  it("対応表に無いカテゴリは無視する（防御的, R2.1）", () => {
    const result = mapWorklifeDispositionAnswers(
      response([
        { categoryName: "改善志向", levels: [[4]] },
        { categoryName: "未知カテゴリ", levels: [[3]] },
      ]),
    );
    expect(result).toEqual([{ disposition: "improvement", level: 4, maxLevel: 4 }]);
  });

  it("selectedLevels が空の回答は無視する（未回答設問）", () => {
    const result = mapWorklifeDispositionAnswers(
      response([{ categoryName: "改善志向", levels: [[], [2]] }]),
    );
    expect(result).toEqual([{ disposition: "improvement", level: 2, maxLevel: 4 }]);
  });
});

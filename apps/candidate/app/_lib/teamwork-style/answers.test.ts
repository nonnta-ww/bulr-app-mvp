/**
 * answers.test.ts — 回答マッピング純関数のユニットテスト（R2.4/R4.6/R5.1）。
 */

import type { SurveyResponseForAnalysis } from "@bulr/db";
import { describe, expect, it } from "vitest";

import { mapTeamworkAnswers } from "./answers";

type Category = SurveyResponseForAnalysis["categories"][number];
type Answer = Category["answers"][number];

function answer(categoryName: string, selectedLevels: number[]): Answer {
  return {
    questionId: `q-${categoryName}-${selectedLevels.join(",")}`,
    categoryName,
    questionBody: "body",
    questionType: "single_choice",
    scoringKind: null,
    selectedLabels: [],
    selectedLevels,
    freeText: null,
  };
}

function response(
  categories: Array<{ name: string; answers: Answer[] }>,
): SurveyResponseForAnalysis {
  return {
    surveyId: "s1",
    jobType: "teamwork_style",
    responseId: "r1",
    submittedAt: new Date(0),
    categories: categories.map((c) => ({
      categoryName: c.name,
      totalQuestions: c.answers.length,
      answers: c.answers,
    })),
  };
}

describe("mapTeamworkAnswers", () => {
  it("null response → 空の写像", () => {
    expect(mapTeamworkAnswers(null)).toEqual({
      styleAnswers: [],
      growthAnswers: [],
    });
  });

  it("L1 カテゴリ → styleAnswers（level 1=高極 / level 0=低極）", () => {
    const r = response([
      { name: "率直さ", answers: [answer("率直さ", [1])] },
      { name: "距離感", answers: [answer("距離感", [0])] },
    ]);
    const { styleAnswers, growthAnswers } = mapTeamworkAnswers(r);
    expect(growthAnswers).toEqual([]);
    expect(styleAnswers).toEqual([
      { axis: "candor", pickedHighPole: true },
      { axis: "distance", pickedHighPole: false },
    ]);
  });

  it("L2 カテゴリ → growthAnswers（level をそのまま）", () => {
    const r = response([
      { name: "自己認識", answers: [answer("自己認識", [2])] },
      { name: "感情の自己制御", answers: [answer("感情の自己制御", [0])] },
    ]);
    const { styleAnswers, growthAnswers } = mapTeamworkAnswers(r);
    expect(styleAnswers).toEqual([]);
    expect(growthAnswers).toEqual([
      { dimension: "selfAwareness", level: 2 },
      { dimension: "selfRegulation", level: 0 },
    ]);
  });

  it("未知カテゴリと空回答は無視する", () => {
    const r = response([
      { name: "未知カテゴリ", answers: [answer("未知カテゴリ", [1])] },
      { name: "率直さ", answers: [answer("率直さ", [])] },
    ]);
    expect(mapTeamworkAnswers(r)).toEqual({
      styleAnswers: [],
      growthAnswers: [],
    });
  });
});

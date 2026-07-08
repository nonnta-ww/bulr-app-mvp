/**
 * answers.test.ts — 思考スタイルアンケート回答→軸マッピングの振る舞いテスト（task 1.3）。
 *
 * THINKING_STYLE_CATEGORY_AXIS（seed 契約の単一ソース）と mapThinkingStyleAnswers の写像規則:
 *  - 4カテゴリ名 → 4軸（抽象と具体/論理と直感/収束と発散/理論と実践）。
 *  - カテゴリ名が未マッピング → その回答は無視。
 *  - selectedLevels 空 → その回答はスキップ。
 *  - null → []。
 *  - emit は常に { axis, level: selectedLevels[0], reverse:false, maxLevel:4 }。
 *
 * 気質（temperament/answers.test.ts）と同型。seed が「高 level = 第2極（具体/直感/発散/実践先行）」
 * に正規化済みのため reverse は常に false（R5.3 の向き契約）。
 */

import { describe, expect, it } from 'vitest';

import type { SurveyResponseForAnalysis } from '@bulr/db';

import {
  THINKING_STYLE_CATEGORY_AXIS,
  mapThinkingStyleAnswers,
} from './answers';
import type { ThinkingStyleAnswer } from './score';

/** 最小の AnswerForAnalysis 相当を組み立てる（categoryName + selectedLevels のみが写像に効く）。 */
function makeAnswer(
  categoryName: string,
  selectedLevels: number[],
): SurveyResponseForAnalysis['categories'][number]['answers'][number] {
  return {
    questionId: `q-${categoryName}-${selectedLevels.join('_')}`,
    categoryName,
    questionBody: 'body',
    questionType: 'single_choice',
    scoringKind: 'proficiency',
    selectedLabels: [],
    selectedLevels,
    freeText: null,
  };
}

/** 最小の SurveyResponseForAnalysis を組み立てる。 */
function makeResponse(
  categories: Array<{ categoryName: string; answers: number[][] }>,
): SurveyResponseForAnalysis {
  return {
    surveyId: 'survey-1',
    jobType: 'thinking-style',
    responseId: 'resp-1',
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    categories: categories.map((c) => ({
      categoryName: c.categoryName,
      totalQuestions: c.answers.length,
      answers: c.answers.map((levels) => makeAnswer(c.categoryName, levels)),
    })),
  };
}

describe('THINKING_STYLE_CATEGORY_AXIS', () => {
  it('4カテゴリ名を対応する4軸へマッピングする（seed 契約）', () => {
    expect(THINKING_STYLE_CATEGORY_AXIS).toEqual({
      抽象と具体: 'abstractConcrete',
      論理と直感: 'logicIntuition',
      収束と発散: 'convergentDivergent',
      理論と実践: 'theoryPractice',
    });
  });
});

describe('mapThinkingStyleAnswers', () => {
  it('4カテゴリすべての回答を正しい軸で ThinkingStyleAnswer[] に写像する', () => {
    const response = makeResponse([
      { categoryName: '抽象と具体', answers: [[1], [3]] },
      { categoryName: '論理と直感', answers: [[2]] },
      { categoryName: '収束と発散', answers: [[0]] },
      { categoryName: '理論と実践', answers: [[4]] },
    ]);

    const result = mapThinkingStyleAnswers(response);

    const expected: ThinkingStyleAnswer[] = [
      { axis: 'abstractConcrete', level: 1, reverse: false, maxLevel: 4 },
      { axis: 'abstractConcrete', level: 3, reverse: false, maxLevel: 4 },
      { axis: 'logicIntuition', level: 2, reverse: false, maxLevel: 4 },
      { axis: 'convergentDivergent', level: 0, reverse: false, maxLevel: 4 },
      { axis: 'theoryPractice', level: 4, reverse: false, maxLevel: 4 },
    ];
    expect(result).toEqual(expected);
  });

  it('すべての emit は reverse:false・maxLevel:4 である', () => {
    const response = makeResponse([
      { categoryName: '抽象と具体', answers: [[2]] },
      { categoryName: '理論と実践', answers: [[1]] },
    ]);

    const result = mapThinkingStyleAnswers(response);

    expect(result.length).toBeGreaterThan(0);
    for (const answer of result) {
      expect(answer.reverse).toBe(false);
      expect(answer.maxLevel).toBe(4);
    }
  });

  it('THINKING_STYLE_CATEGORY_AXIS に無いカテゴリ名の回答は無視する', () => {
    const response = makeResponse([
      { categoryName: '抽象と具体', answers: [[1]] },
      { categoryName: '未知のカテゴリ', answers: [[2], [3]] },
    ]);

    const result = mapThinkingStyleAnswers(response);

    expect(result).toEqual([
      { axis: 'abstractConcrete', level: 1, reverse: false, maxLevel: 4 },
    ]);
  });

  it('selectedLevels が空の回答はスキップする', () => {
    const response = makeResponse([
      { categoryName: '論理と直感', answers: [[], [3]] },
    ]);

    const result = mapThinkingStyleAnswers(response);

    expect(result).toEqual([
      { axis: 'logicIntuition', level: 3, reverse: false, maxLevel: 4 },
    ]);
  });

  it('先頭以外の selectedLevels は無視し level=selectedLevels[0] を採る', () => {
    const response = makeResponse([
      { categoryName: '収束と発散', answers: [[2, 4]] },
    ]);

    const result = mapThinkingStyleAnswers(response);

    expect(result).toEqual([
      { axis: 'convergentDivergent', level: 2, reverse: false, maxLevel: 4 },
    ]);
  });

  it('null → []', () => {
    expect(mapThinkingStyleAnswers(null)).toEqual([]);
  });
});

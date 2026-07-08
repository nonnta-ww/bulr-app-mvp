/**
 * answers.test.ts — 気質アンケート回答→軸マッピングの振る舞いテスト（task 1.4）。
 *
 * PLAYSTYLE_CATEGORY_AXIS（seed 契約の単一ソース）と mapTemperamentAnswers の写像規則:
 *  - 4カテゴリ名 → 4軸（探索と深化/個人と協調/計画と即興/堅実と挑戦）。
 *  - カテゴリ名が未マッピング → その回答は無視。
 *  - selectedLevels 空 → その回答はスキップ。
 *  - null → []。
 *  - emit は常に { axis, level: selectedLevels[0], reverse:false, maxLevel:4 }。
 */

import { describe, expect, it } from 'vitest';

import type { SurveyResponseForAnalysis } from '@bulr/db';

import { PLAYSTYLE_CATEGORY_AXIS, mapTemperamentAnswers } from './answers';
import type { TemperamentAnswer } from './score';

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
    jobType: 'playstyle',
    responseId: 'resp-1',
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    categories: categories.map((c) => ({
      categoryName: c.categoryName,
      totalQuestions: c.answers.length,
      answers: c.answers.map((levels) => makeAnswer(c.categoryName, levels)),
    })),
  };
}

describe('PLAYSTYLE_CATEGORY_AXIS', () => {
  it('4カテゴリ名を対応する4軸へマッピングする（seed 契約）', () => {
    expect(PLAYSTYLE_CATEGORY_AXIS).toEqual({
      探索と深化: 'explorationDeepening',
      個人と協調: 'soloCollaboration',
      計画と即興: 'planningImprovisation',
      堅実と挑戦: 'stabilityChallenge',
    });
  });
});

describe('mapTemperamentAnswers', () => {
  it('4カテゴリすべての回答を正しい軸で TemperamentAnswer[] に写像する', () => {
    const response = makeResponse([
      { categoryName: '探索と深化', answers: [[1], [3]] },
      { categoryName: '個人と協調', answers: [[2]] },
      { categoryName: '計画と即興', answers: [[0]] },
      { categoryName: '堅実と挑戦', answers: [[4]] },
    ]);

    const result = mapTemperamentAnswers(response);

    const expected: TemperamentAnswer[] = [
      { axis: 'explorationDeepening', level: 1, reverse: false, maxLevel: 4 },
      { axis: 'explorationDeepening', level: 3, reverse: false, maxLevel: 4 },
      { axis: 'soloCollaboration', level: 2, reverse: false, maxLevel: 4 },
      { axis: 'planningImprovisation', level: 0, reverse: false, maxLevel: 4 },
      { axis: 'stabilityChallenge', level: 4, reverse: false, maxLevel: 4 },
    ];
    expect(result).toEqual(expected);
  });

  it('すべての emit は reverse:false・maxLevel:4 である', () => {
    const response = makeResponse([
      { categoryName: '探索と深化', answers: [[2]] },
      { categoryName: '堅実と挑戦', answers: [[1]] },
    ]);

    const result = mapTemperamentAnswers(response);

    expect(result.length).toBeGreaterThan(0);
    for (const answer of result) {
      expect(answer.reverse).toBe(false);
      expect(answer.maxLevel).toBe(4);
    }
  });

  it('PLAYSTYLE_CATEGORY_AXIS に無いカテゴリ名の回答は無視する', () => {
    const response = makeResponse([
      { categoryName: '探索と深化', answers: [[1]] },
      { categoryName: '未知のカテゴリ', answers: [[2], [3]] },
    ]);

    const result = mapTemperamentAnswers(response);

    expect(result).toEqual([
      { axis: 'explorationDeepening', level: 1, reverse: false, maxLevel: 4 },
    ]);
  });

  it('selectedLevels が空の回答はスキップする', () => {
    const response = makeResponse([
      { categoryName: '個人と協調', answers: [[], [3]] },
    ]);

    const result = mapTemperamentAnswers(response);

    expect(result).toEqual([
      { axis: 'soloCollaboration', level: 3, reverse: false, maxLevel: 4 },
    ]);
  });

  it('先頭以外の selectedLevels は無視し level=selectedLevels[0] を採る', () => {
    const response = makeResponse([
      { categoryName: '計画と即興', answers: [[2, 4]] },
    ]);

    const result = mapTemperamentAnswers(response);

    expect(result).toEqual([
      { axis: 'planningImprovisation', level: 2, reverse: false, maxLevel: 4 },
    ]);
  });

  it('null → []', () => {
    expect(mapTemperamentAnswers(null)).toEqual([]);
  });
});

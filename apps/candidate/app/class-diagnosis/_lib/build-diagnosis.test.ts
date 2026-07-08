/**
 * build-diagnosis.ts のユニットテスト（純関数・決定論・task 7）。
 *
 * DB クエリ結果 → 判定純関数への写像・版署名・スナップショット・フレーバー回答の組み立てを検証する。
 * DB/LLM/auth には一切触れない（純関数のみ）。
 *  - mapVocationInput: passthrough
 *  - mapTemperamentAnswers: 軸写像 / 空→[] / reverse=false / maxLevel=4
 *  - buildSourceSignature: 決定論・skill id 順序非依存
 *  - computeClassResult: full（playstyle あり→temperament set）/ partial（null→temperament null）
 *  - buildSourceSnapshot: 形状
 *  - buildFlavorAnswers: playstyle 由来 / null→[]
 */

import { describe, expect, it } from 'vitest';

import type { CandidateVocationSource, SurveyResponseForAnalysis } from '@bulr/db';

import {
  PLAYSTYLE_CATEGORY_AXIS,
  mapVocationInput,
  mapTemperamentAnswers,
  buildSourceSignature,
  buildSourceSnapshot,
  computeClassResult,
  buildFlavorAnswers,
} from './build-diagnosis';

// ---------------------------------------------------------------------------
// フィクスチャヘルパー
// ---------------------------------------------------------------------------

/** vanguard（前衛）に高スコアが乗る skill ソースを組み立てる。 */
function makeVocationSource(overrides?: Partial<CandidateVocationSource>): CandidateVocationSource {
  return {
    surveys: [
      {
        surveyId: 'survey-fe',
        jobType: 'frontend',
        responseId: 'resp-fe',
        submittedAt: new Date('2026-07-01T00:00:00.000Z'),
        overallCoverageRatio: 0.8,
      },
    ],
    categories: [
      {
        surveyId: 'survey-fe',
        jobType: 'frontend',
        categoryName: 'UI実装',
        categoryScore: 90,
        answeredCount: 10,
      },
    ],
    ...overrides,
  };
}

/** 気質4軸 → seed カテゴリ名（app core answers.ts の PLAYSTYLE_CATEGORY_AXIS と一致）。 */
const AXIS_CATEGORY: Record<string, string> = {
  explorationDeepening: '探索と深化',
  soloCollaboration: '個人と協調',
  planningImprovisation: '計画と即興',
  stabilityChallenge: '堅実と挑戦',
};

/**
 * playstyle 回答束を組み立てる（axis ごとに level 配列を指定）。
 * 指定した軸のカテゴリのみ生成する（未指定の軸は未回答 → partial に寄与）。
 */
function makePlaystyle(
  levels: Partial<Record<keyof typeof AXIS_CATEGORY, number[]>>,
  overrides?: Partial<SurveyResponseForAnalysis>,
): SurveyResponseForAnalysis {
  const makeAnswers = (categoryName: string, levelList: number[]) =>
    levelList.map((level, i) => ({
      questionId: `${categoryName}-q${i}`,
      categoryName,
      questionBody: `${categoryName} 設問 ${i}`,
      questionType: 'single_choice' as const,
      scoringKind: 'polarity' as const,
      selectedLabels: [`選択-${level}`],
      selectedLevels: [level],
      freeText: null,
    }));

  const categories = Object.entries(levels).map(([axis, levelList]) => {
    const categoryName = AXIS_CATEGORY[axis]!;
    const list = levelList ?? [];
    return {
      categoryName,
      totalQuestions: list.length,
      answers: makeAnswers(categoryName, list),
    };
  });

  return {
    surveyId: 'survey-playstyle',
    jobType: 'playstyle',
    responseId: 'resp-playstyle',
    submittedAt: new Date('2026-07-02T00:00:00.000Z'),
    categories,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapVocationInput
// ---------------------------------------------------------------------------

describe('mapVocationInput', () => {
  it('categories を jobType/categoryName/categoryScore/answeredCount で passthrough する', () => {
    const source = makeVocationSource({
      categories: [
        { surveyId: 's1', jobType: 'frontend', categoryName: 'A', categoryScore: 50, answeredCount: 3 },
        { surveyId: 's2', jobType: 'backend', categoryName: 'B', categoryScore: null, answeredCount: 0 },
      ],
    });
    expect(mapVocationInput(source)).toEqual({
      categories: [
        { jobType: 'frontend', categoryName: 'A', categoryScore: 50, answeredCount: 3 },
        { jobType: 'backend', categoryName: 'B', categoryScore: null, answeredCount: 0 },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// mapTemperamentAnswers
// ---------------------------------------------------------------------------

describe('mapTemperamentAnswers', () => {
  it('null → 空配列', () => {
    expect(mapTemperamentAnswers(null)).toEqual([]);
  });

  it('カテゴリ名を軸へ写像し reverse=false / maxLevel=4 で emit する', () => {
    const playstyle = makePlaystyle({
      explorationDeepening: [4, 3],
      soloCollaboration: [0],
    });
    const answers = mapTemperamentAnswers(playstyle);
    expect(answers).toEqual([
      { axis: 'explorationDeepening', level: 4, reverse: false, maxLevel: 4 },
      { axis: 'explorationDeepening', level: 3, reverse: false, maxLevel: 4 },
      { axis: 'soloCollaboration', level: 0, reverse: false, maxLevel: 4 },
    ]);
    // 全て reverse=false・maxLevel=4
    expect(answers.every((a) => a.reverse === false && a.maxLevel === 4)).toBe(true);
  });

  it('未知カテゴリ / selectedLevels 空 の回答はスキップする', () => {
    const playstyle: SurveyResponseForAnalysis = {
      surveyId: 'sp',
      jobType: 'playstyle',
      responseId: 'rp',
      submittedAt: new Date('2026-07-02T00:00:00.000Z'),
      categories: [
        {
          categoryName: '無関係カテゴリ',
          totalQuestions: 1,
          answers: [
            {
              questionId: 'x-q0',
              categoryName: '無関係カテゴリ',
              questionBody: 'x',
              questionType: 'single_choice',
              scoringKind: 'polarity',
              selectedLabels: ['a'],
              selectedLevels: [2],
              freeText: null,
            },
          ],
        },
        {
          categoryName: '探索と深化',
          totalQuestions: 1,
          answers: [
            {
              questionId: 'y-q0',
              categoryName: '探索と深化',
              questionBody: 'y',
              questionType: 'single_choice',
              scoringKind: 'polarity',
              selectedLabels: [],
              selectedLevels: [], // 空 → スキップ
              freeText: null,
            },
          ],
        },
      ],
    };
    expect(mapTemperamentAnswers(playstyle)).toEqual([]);
  });

  it('PLAYSTYLE_CATEGORY_AXIS は seed 契約どおりの4軸対応（app core answers.ts と共有）', () => {
    expect(PLAYSTYLE_CATEGORY_AXIS).toEqual({
      探索と深化: 'explorationDeepening',
      個人と協調: 'soloCollaboration',
      計画と即興: 'planningImprovisation',
      堅実と挑戦: 'stabilityChallenge',
    });
  });
});

// ---------------------------------------------------------------------------
// buildSourceSignature
// ---------------------------------------------------------------------------

describe('buildSourceSignature', () => {
  it('同一入力 → 同一署名（決定論）', () => {
    const source = makeVocationSource();
    const a = buildSourceSignature(source, 'resp-playstyle');
    const b = buildSourceSignature(source, 'resp-playstyle');
    expect(a).toBe(b);
  });

  it('skill responseId の並び順に依存しない（ソート済み）', () => {
    const s1 = makeVocationSource({
      surveys: [
        { surveyId: 'a', jobType: 'frontend', responseId: 'r-b', submittedAt: new Date(0), overallCoverageRatio: 1 },
        { surveyId: 'b', jobType: 'backend', responseId: 'r-a', submittedAt: new Date(0), overallCoverageRatio: 1 },
      ],
    });
    const s2 = makeVocationSource({
      surveys: [
        { surveyId: 'b', jobType: 'backend', responseId: 'r-a', submittedAt: new Date(0), overallCoverageRatio: 1 },
        { surveyId: 'a', jobType: 'frontend', responseId: 'r-b', submittedAt: new Date(0), overallCoverageRatio: 1 },
      ],
    });
    expect(buildSourceSignature(s1, null)).toBe(buildSourceSignature(s2, null));
  });

  it('playstyle 有無で署名が変わり、null は固定センチネルを使う', () => {
    const source = makeVocationSource();
    const withPs = buildSourceSignature(source, 'resp-playstyle');
    const withoutPs = buildSourceSignature(source, null);
    expect(withPs).not.toBe(withoutPs);
    expect(withoutPs.endsWith('|-')).toBe(true);
    expect(withPs.endsWith('|resp-playstyle')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSourceSnapshot
// ---------------------------------------------------------------------------

describe('buildSourceSnapshot', () => {
  it('skillResponses と playstyle(responseId/submittedAt) を ISO 文字列で組み立てる', () => {
    const source = makeVocationSource();
    const playstyle = makePlaystyle({ explorationDeepening: [4], soloCollaboration: [4] });
    const snapshot = buildSourceSnapshot(source, playstyle);
    expect(snapshot).toEqual({
      skillResponses: [
        {
          surveyId: 'survey-fe',
          responseId: 'resp-fe',
          submittedAt: '2026-07-01T00:00:00.000Z',
          overallCoverageRatio: 0.8,
        },
      ],
      playstyleResponseId: 'resp-playstyle',
      playstyleSubmittedAt: '2026-07-02T00:00:00.000Z',
    });
  });

  it('playstyle=null → playstyleResponseId/submittedAt が null', () => {
    const snapshot = buildSourceSnapshot(makeVocationSource(), null);
    expect(snapshot.playstyleResponseId).toBeNull();
    expect(snapshot.playstyleSubmittedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeClassResult
// ---------------------------------------------------------------------------

describe('computeClassResult', () => {
  it('playstyle 全4軸あり → full な TemperamentSummary（code 確定）を持つ ClassResult を返す', () => {
    const source = makeVocationSource();
    // 全4軸を高 level で回答 → 全軸 determined → completeness='full'・code 確定。
    const playstyle = makePlaystyle({
      explorationDeepening: [4, 4, 4], // 高 → deepener
      soloCollaboration: [4, 4, 4], // 高 → collab
      planningImprovisation: [4, 4, 4], // 高 → improviser
      stabilityChallenge: [4, 4, 4], // 高 → challenger
    });
    const result = computeClassResult(source, playstyle);
    expect(result.temperament).not.toBeNull();
    expect(result.temperament!.completeness).toBe('full');
    expect(result.temperament!.code).toBe('deepener-collab-improviser-challenger');
    expect(result.primaryVocation).toBeTruthy();
    expect(result.className.length).toBeGreaterThan(0);
    // vocationVector は7キー常在
    expect(Object.keys(result.vocationVector).length).toBe(7);
  });

  it('playstyle 一部軸のみ → partial な TemperamentSummary（code=null）', () => {
    const source = makeVocationSource();
    // 2軸のみ回答 → determined 2/4 → completeness='partial'・code=null。
    const playstyle = makePlaystyle({
      explorationDeepening: [4, 4, 4],
      soloCollaboration: [4, 4, 4],
    });
    const result = computeClassResult(source, playstyle);
    expect(result.temperament).not.toBeNull();
    expect(result.temperament!.completeness).toBe('partial');
    expect(result.temperament!.code).toBeNull();
    // determined 軸の極のみ poles に載る
    expect(result.temperament!.poles.explorationDeepening).toBe('deepener');
    expect(result.temperament!.poles.soloCollaboration).toBe('collab');
    expect(result.temperament!.poles.planningImprovisation).toBeUndefined();
  });

  it('playstyle 未回答（null）→ temperament=null の partial だが valid な ClassResult', () => {
    const source = makeVocationSource();
    const result = computeClassResult(source, null);
    expect(result.temperament).toBeNull();
    expect(result.className.length).toBeGreaterThan(0);
    // confidence は totalAnswered で決まる（answeredCount=10 >= 8 → normal）
    expect(result.confidence).toBe('normal');
    expect(Object.keys(result.vocationVector).length).toBe(7);
  });

  it('低回答（totalAnswered < 8）→ confidence=low', () => {
    const source = makeVocationSource({
      categories: [
        { surveyId: 'survey-fe', jobType: 'frontend', categoryName: 'UI実装', categoryScore: 90, answeredCount: 3 },
      ],
    });
    const result = computeClassResult(source, null);
    expect(result.confidence).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// buildFlavorAnswers
// ---------------------------------------------------------------------------

describe('buildFlavorAnswers', () => {
  it('null → 空配列', () => {
    expect(buildFlavorAnswers(null)).toEqual([]);
  });

  it('playstyle 回答を {categoryName, selectedLabels, freeText} へ写像する', () => {
    const playstyle = makePlaystyle({ explorationDeepening: [4], soloCollaboration: [0] });
    const answers = buildFlavorAnswers(playstyle);
    expect(answers).toEqual([
      { categoryName: '探索と深化', selectedLabels: ['選択-4'], freeText: null },
      { categoryName: '個人と協調', selectedLabels: ['選択-0'], freeText: null },
    ]);
  });
});

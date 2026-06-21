import { describe, it, expect } from 'vitest';
import type { SurveyResponseForAnalysis } from '@bulr/db';
import { aggregate } from './aggregate';

// ---------------------------------------------------------------------------
// ヘルパー: SurveyResponseForAnalysis フィクスチャをインラインで組み立てる
// (DB 接続を引き起こさないよう runtime import は一切しない)
// ---------------------------------------------------------------------------

type Answer = SurveyResponseForAnalysis['categories'][number]['answers'][number];

let qSeq = 0;
function ans(partial: Partial<Answer>): Answer {
  qSeq += 1;
  return {
    questionId: `q-${qSeq}`,
    categoryName: partial.categoryName ?? 'C',
    questionBody: `body-${qSeq}`,
    questionType: partial.questionType ?? 'single_choice',
    scoringKind: partial.scoringKind ?? null,
    selectedLabels: partial.selectedLabels ?? [],
    selectedLevels: partial.selectedLevels ?? [],
    freeText: partial.freeText ?? null,
  };
}

function source(
  categories: Array<{ categoryName: string; totalQuestions: number; answers: Answer[] }>,
): SurveyResponseForAnalysis {
  return {
    surveyId: 'survey-1',
    jobType: 'backend',
    responseId: 'resp-1',
    submittedAt: new Date('2026-06-01T00:00:00Z'),
    categories,
  };
}

const proficiency = (levels: number[], categoryName = 'C') =>
  ans({ categoryName, scoringKind: 'proficiency', selectedLabels: levels.map(String), selectedLevels: levels });

const recency = (level: number, label: string, categoryName = 'C') =>
  ans({ categoryName, scoringKind: 'recency', selectedLabels: [label], selectedLevels: [level] });

describe('aggregate — 熟練度スコア (Req 5.1, 5.2)', () => {
  it('proficiency 回答の level 平均を MAX_LEVEL=3 基準で 0..100 に正規化し四捨五入する', () => {
    const snap = aggregate(
      source([{ categoryName: 'C', totalQuestions: 2, answers: [proficiency([2]), proficiency([3])] }]),
    );
    const cat = snap.categories[0]!;
    // mean([2,3]) = 2.5 → 2.5/3*100 = 83.33 → 83
    expect(cat.proficiencyScore).toBe(83);
    expect(cat.answeredProficiencyCount).toBe(2);
  });

  it('level=3 は 100、level=0 は 0 になる', () => {
    expect(aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [proficiency([3])] }])).categories[0]!.proficiencyScore).toBe(100);
    expect(aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [proficiency([0])] }])).categories[0]!.proficiencyScore).toBe(0);
  });

  it('レベル混在（0,1,2,3）の平均/最大×100 を四捨五入する', () => {
    const snap = aggregate(
      source([
        {
          categoryName: 'C',
          totalQuestions: 4,
          answers: [proficiency([0]), proficiency([1]), proficiency([2]), proficiency([3])],
        },
      ]),
    );
    const cat = snap.categories[0]!;
    // mean([0,1,2,3]) = 1.5 → 1.5/3*100 = 50
    expect(cat.proficiencyScore).toBe(50);
    expect(cat.answeredProficiencyCount).toBe(4);
  });

  it('proficiency 回答が0件のカテゴリは proficiencyScore=null・answeredProficiencyCount=0 (Req 5.4)', () => {
    const snap = aggregate(
      source([
        {
          categoryName: 'C',
          totalQuestions: 2,
          answers: [
            ans({ questionType: 'multi_choice', selectedLabels: ['Java', 'Go'], selectedLevels: [] }),
            ans({ questionType: 'free_text', freeText: '理由' }),
          ],
        },
      ]),
    );
    const cat = snap.categories[0]!;
    expect(cat.proficiencyScore).toBeNull();
    expect(cat.answeredProficiencyCount).toBe(0);
  });
});

describe('aggregate — 直近利用 (Req 5.3)', () => {
  it('recency 設問の選択 level から序数とラベルを決定し、複数あれば最大序数（最新）を採用する', () => {
    const snap = aggregate(
      source([
        {
          categoryName: 'C',
          totalQuestions: 2,
          answers: [recency(2, '3年以内'), recency(4, '現在も利用中')],
        },
      ]),
    );
    const cat = snap.categories[0]!;
    expect(cat.recencyOrdinal).toBe(4);
    expect(cat.recencyLabel).toBe('現在も利用中');
  });

  it('recency は熟練度平均に混ざらない（独立系統）', () => {
    const snap = aggregate(
      source([
        {
          categoryName: 'C',
          totalQuestions: 2,
          answers: [proficiency([0]), recency(4, '現在も利用中')],
        },
      ]),
    );
    const cat = snap.categories[0]!;
    expect(cat.proficiencyScore).toBe(0); // recency level=4 は混入しない
    expect(cat.answeredProficiencyCount).toBe(1);
    expect(cat.recencyOrdinal).toBe(4);
  });

  it('recency 回答が無いカテゴリは recencyOrdinal=null・recencyLabel=null', () => {
    const cat = aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [proficiency([2])] }])).categories[0]!;
    expect(cat.recencyOrdinal).toBeNull();
    expect(cat.recencyLabel).toBeNull();
  });
});

describe('aggregate — 同名カテゴリ集約 (subcategory 跨ぎ)', () => {
  it('同名カテゴリの proficiency と recency を1エントリへ集約する', () => {
    const snap = aggregate(
      source([
        { categoryName: 'プログラミング', totalQuestions: 1, answers: [proficiency([3], 'プログラミング')] },
        { categoryName: 'プログラミング', totalQuestions: 1, answers: [recency(3, '1年以内', 'プログラミング')] },
      ]),
    );
    expect(snap.categories).toHaveLength(1);
    const cat = snap.categories[0]!;
    expect(cat.categoryName).toBe('プログラミング');
    expect(cat.proficiencyScore).toBe(100);
    expect(cat.recencyOrdinal).toBe(3);
    expect(cat.recencyLabel).toBe('1年以内');
  });

  it('同名カテゴリを跨いで proficiency の level が合算され平均される', () => {
    const snap = aggregate(
      source([
        { categoryName: 'C', totalQuestions: 1, answers: [proficiency([3], 'C')] },
        { categoryName: 'C', totalQuestions: 1, answers: [proficiency([1], 'C')] },
      ]),
    );
    expect(snap.categories).toHaveLength(1);
    const cat = snap.categories[0]!;
    // mean([3,1]) = 2 → 2/3*100 = 67
    expect(cat.proficiencyScore).toBe(67);
    expect(cat.answeredProficiencyCount).toBe(2);
  });

  it('同名カテゴリで複数の recency を持つ場合は集約後も最大序数（最新）を採用する', () => {
    const snap = aggregate(
      source([
        { categoryName: 'DB', totalQuestions: 1, answers: [recency(1, '3年以上前', 'DB')] },
        { categoryName: 'DB', totalQuestions: 1, answers: [recency(4, '現在も利用中', 'DB')] },
      ]),
    );
    expect(snap.categories).toHaveLength(1);
    const cat = snap.categories[0]!;
    expect(cat.recencyOrdinal).toBe(4);
    expect(cat.recencyLabel).toBe('現在も利用中');
  });
});

describe('aggregate — 既存指標の不変 (回帰なし)', () => {
  const input = source([
    {
      categoryName: 'C',
      totalQuestions: 3,
      answers: [
        proficiency([2]),
        ans({ questionType: 'multi_choice', selectedLabels: ['Java', 'Go'], selectedLevels: [] }),
        ans({ questionType: 'free_text', freeText: '理由' }),
      ],
    },
  ]);

  it('既存のカバレッジ・広さ・自由記述有無・全体網羅度は熟練度追加後も変わらない', () => {
    const cat = aggregate(input).categories[0]!;
    expect(cat.answeredQuestions).toBe(3);
    expect(cat.totalQuestions).toBe(3);
    expect(cat.coverageRatio).toBe(1);
    expect(cat.selectedBreadth).toBe(3); // proficiency:1 + multi:2 + free:0
    expect(cat.freeTextPresence).toBe(true);
    expect(aggregate(input).overallCoverageRatio).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 頻度スコア (Req 4.2, 4.3, 4.4, 7.5)
// ---------------------------------------------------------------------------

const frequency = (levels: number[], categoryName = 'C') =>
  ans({ categoryName, scoringKind: 'frequency', selectedLabels: levels.map(String), selectedLevels: levels });

describe('aggregate — 頻度スコア (Req 4.2, 4.3, 4.4)', () => {
  it('frequency 回答の level 平均を MAX_LEVEL=3 基準で 0..100 に正規化し四捨五入する (a)', () => {
    // levels [1,3] → mean=2 → 2/3*100 = 66.67 → 67
    const snap = aggregate(
      source([{ categoryName: 'C', totalQuestions: 2, answers: [frequency([1]), frequency([3])] }]),
    );
    const cat = snap.categories[0]!;
    expect(cat.frequencyScore).toBe(67);
    expect(cat.answeredFrequencyCount).toBe(2);
  });

  it('frequency は proficiency/recency の出力を変えない（非混入） (b)', () => {
    // 同一 proficiency + recency に frequency を加えても proficiency/recency 出力は不変
    const baseAnswers = [proficiency([2]), recency(3, '1年以内')];
    const withFreqAnswers = [proficiency([2]), recency(3, '1年以内'), frequency([1])];

    const baseSnap = aggregate(source([{ categoryName: 'C', totalQuestions: 2, answers: baseAnswers }]));
    const withFreqSnap = aggregate(source([{ categoryName: 'C', totalQuestions: 3, answers: withFreqAnswers }]));

    const baseCat = baseSnap.categories[0]!;
    const withFreqCat = withFreqSnap.categories[0]!;

    // proficiency 出力が完全一致
    expect(withFreqCat.proficiencyScore).toBe(baseCat.proficiencyScore);
    expect(withFreqCat.answeredProficiencyCount).toBe(baseCat.answeredProficiencyCount);
    // recency 出力が完全一致
    expect(withFreqCat.recencyOrdinal).toBe(baseCat.recencyOrdinal);
    expect(withFreqCat.recencyLabel).toBe(baseCat.recencyLabel);
    // frequency は独自に反映される
    expect(withFreqCat.frequencyScore).toBe(33); // 1/3*100 = 33.33 → 33
    expect(withFreqCat.answeredFrequencyCount).toBe(1);
  });

  it('frequency のみのカテゴリは proficiencyScore=null かつ frequencyScore が非 null になる (c)', () => {
    const snap = aggregate(
      source([{ categoryName: 'C', totalQuestions: 1, answers: [frequency([2])] }]),
    );
    const cat = snap.categories[0]!;
    expect(cat.proficiencyScore).toBeNull();
    expect(cat.answeredProficiencyCount).toBe(0);
    expect(cat.frequencyScore).toBe(67); // 2/3*100 = 66.67 → 67
    expect(cat.answeredFrequencyCount).toBe(1);
  });

  it('frequency 回答が0件のカテゴリは frequencyScore=null (d)', () => {
    const snap = aggregate(
      source([{ categoryName: 'C', totalQuestions: 1, answers: [proficiency([2])] }]),
    );
    const cat = snap.categories[0]!;
    expect(cat.frequencyScore).toBeNull();
    expect(cat.answeredFrequencyCount).toBe(0);
  });

  it('level=3 は 100、level=0 は 0 になる（frequency）', () => {
    expect(
      aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [frequency([3])] }])).categories[0]!.frequencyScore,
    ).toBe(100);
    expect(
      aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [frequency([0])] }])).categories[0]!.frequencyScore,
    ).toBe(0);
  });

  it('同名カテゴリを跨いで frequency が合算され平均される', () => {
    const snap = aggregate(
      source([
        { categoryName: 'C', totalQuestions: 1, answers: [frequency([3], 'C')] },
        { categoryName: 'C', totalQuestions: 1, answers: [frequency([0], 'C')] },
      ]),
    );
    expect(snap.categories).toHaveLength(1);
    const cat = snap.categories[0]!;
    // mean([3,0]) = 1.5 → 1.5/3*100 = 50
    expect(cat.frequencyScore).toBe(50);
    expect(cat.answeredFrequencyCount).toBe(2);
  });

  it('旧データ（scoringKind/selectedLevels 欠落）でも frequency 系指標はエラーなく null になる (Req 4.4)', () => {
    const legacyAnswer = {
      questionId: 'old-freq-1',
      categoryName: 'C',
      questionBody: 'old',
      questionType: 'single_choice',
      selectedLabels: ['たまに'],
      freeText: null,
    } as unknown as Answer;
    const snap = aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [legacyAnswer] }]));
    const cat = snap.categories[0]!;
    expect(cat.frequencyScore).toBeNull();
    expect(cat.answeredFrequencyCount).toBe(0);
  });
});

describe('aggregate — 決定論性 & null 安全 (Req 8.1, 5.4)', () => {
  it('同一入力で同一スナップショットを返す（決定論的）', () => {
    const input = source([
      { categoryName: 'C', totalQuestions: 2, answers: [proficiency([1]), recency(2, '3年以内')] },
    ]);
    expect(aggregate(input)).toEqual(aggregate(input));
  });

  it('scoringKind/selectedLevels を欠く旧データ形でも破綻せず欠損として扱う', () => {
    // 旧 AnswerForAnalysis 形（新フィールド無し）を runtime で渡すケースを模擬
    const legacyAnswer = {
      questionId: 'old-1',
      categoryName: 'C',
      questionBody: 'old',
      questionType: 'single_choice',
      selectedLabels: ['はい'],
      freeText: null,
    } as unknown as Answer;
    const snap = aggregate(source([{ categoryName: 'C', totalQuestions: 1, answers: [legacyAnswer] }]));
    const cat = snap.categories[0]!;
    expect(cat.proficiencyScore).toBeNull();
    expect(cat.answeredProficiencyCount).toBe(0);
    expect(cat.recencyOrdinal).toBeNull();
    expect(cat.answeredQuestions).toBe(1); // 既存のカバレッジ判定は維持
  });
});

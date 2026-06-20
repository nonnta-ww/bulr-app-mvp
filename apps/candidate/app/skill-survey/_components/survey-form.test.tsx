// @vitest-environment jsdom
/**
 * SurveyForm UI テスト（task 6.3 / Req 1.4）
 *
 * 検証フロー:
 *  - 能力系設問が4段階（proficiency single_choice）で選択肢表示される
 *  - 必須未回答だと「次へ」で先へ進めず、必須エラーが出る
 *  - 選択すれば次のステップへ進める
 *
 * submitSurvey（Server Action）はモックして DB/サーバ依存を遮断する。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../[surveyId]/_actions/submit-survey', () => ({
  submitSurvey: vi.fn(),
}));

import type { SkillSurvey } from '@bulr/db/schema';

import { SurveyForm } from './survey-form';
import type { CategoryWithQuestions } from '../_lib/survey-structure';

afterEach(cleanup);

const PROFICIENCY_LABELS = [
  '未経験・知識なし',
  '学習・理解はある（実務経験なし）',
  '実務で実装・運用したことがある',
  '設計・改善を主導／チームへ展開・標準化した',
];

const D = new Date(0);

function makeSurvey(): SkillSurvey {
  return {
    id: 's1',
    jobType: 'backend',
    title: 'バックエンド',
    description: null,
    isActive: true,
    createdAt: D,
    updatedAt: D,
  };
}

// 2 カテゴリ = 2 ステップ。ステップ0 に必須 4 段階 proficiency 設問、
// ステップ1 に任意設問を置き「次へ」の遷移可否を検証する。
function makeCategories(): CategoryWithQuestions[] {
  return [
    {
      id: 'cat-a',
      skillSurveyId: 's1',
      name: 'カテゴリA',
      subcategory: null,
      displayOrder: 0,
      createdAt: D,
      updatedAt: D,
      questions: [
        {
          id: 'q-prof',
          categoryId: 'cat-a',
          body: '熟練度を教えてください',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          isRequired: true,
          displayOrder: 0,
          createdAt: D,
          updatedAt: D,
          choices: PROFICIENCY_LABELS.map((label, i) => ({
            id: `c-${i}`,
            questionId: 'q-prof',
            label,
            level: i,
            displayOrder: i,
            createdAt: D,
          })),
        },
      ],
    },
    {
      id: 'cat-b',
      skillSurveyId: 's1',
      name: 'カテゴリB',
      subcategory: null,
      displayOrder: 1,
      createdAt: D,
      updatedAt: D,
      questions: [
        {
          id: 'q-opt',
          categoryId: 'cat-b',
          body: '任意の自由記述',
          questionType: 'free_text',
          scoringKind: null,
          isRequired: false,
          displayOrder: 0,
          createdAt: D,
          updatedAt: D,
          choices: [],
        },
      ],
    },
  ];
}

describe('SurveyForm — 4段階熟練度設問と必須ガード (Req 1.4)', () => {
  it('能力系設問が4段階のラジオで表示される', () => {
    render(<SurveyForm survey={makeSurvey()} categories={makeCategories()} existingResponse={null} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    for (const label of PROFICIENCY_LABELS) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('必須未回答のまま「次へ」を押すと先へ進めず必須エラーが出る', async () => {
    const user = userEvent.setup();
    render(<SurveyForm survey={makeSurvey()} categories={makeCategories()} existingResponse={null} />);

    expect(screen.getByRole('heading', { name: 'カテゴリA' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByText('この設問への回答は必須です。')).toBeInTheDocument();
    // ステップは進んでいない（見出しはカテゴリAのまま、カテゴリBは未表示）
    expect(screen.getByRole('heading', { name: 'カテゴリA' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'カテゴリB' })).not.toBeInTheDocument();
  });

  it('4段階のいずれかを選べば「次へ」で次ステップへ進める', async () => {
    const user = userEvent.setup();
    render(<SurveyForm survey={makeSurvey()} categories={makeCategories()} existingResponse={null} />);

    await user.click(screen.getByRole('radio', { name: '実務で実装・運用したことがある' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByRole('heading', { name: 'カテゴリB' })).toBeInTheDocument();
    expect(screen.queryByText('この設問への回答は必須です。')).not.toBeInTheDocument();
  });
});

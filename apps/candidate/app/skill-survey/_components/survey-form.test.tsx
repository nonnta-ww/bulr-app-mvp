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
import { submitSurvey } from '../[surveyId]/_actions/submit-survey';
import type { CategoryWithQuestions } from '../_lib/survey-structure';

const submitMock = submitSurvey as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  submitMock.mockReset();
  vi.restoreAllMocks();
});

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
    kind: 'skill',
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

  it('ナビゲーション/送信ボタンは type="button" で、最終ステップ遷移で誤送信しない', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<SurveyForm survey={makeSurvey()} categories={makeCategories()} existingResponse={null} />);

    // ステップ0: 「次へ」は type="button"（type="submit" を使わない）
    const nextBtn = screen.getByRole('button', { name: '次へ' });
    expect(nextBtn).toHaveAttribute('type', 'button');

    // 必須回答 → 最終ステップへ。遷移しても submit は呼ばれない（誤送信なし）
    await user.click(screen.getByRole('radio', { name: '実務で実装・運用したことがある' }));
    await user.click(nextBtn);
    expect(screen.getByRole('heading', { name: 'カテゴリB' })).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();

    // 最終ステップの「回答を送信する」も type="button"（ネイティブ送信経路を持たない）
    const submitBtn = screen.getByRole('button', { name: '回答を送信する' });
    expect(submitBtn).toHaveAttribute('type', 'button');

    // 明示的に押したときだけ submit が呼ばれる
    await user.click(submitBtn);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('業務エラー（candidateAction が単層 {ok:false,error} に畳む）でエラーを表示する', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // candidateAction は ActionError を捕捉して単層の {ok:false, error} を返す。
    // consumer は 1 段階（result.ok）で業務エラーを読めることを検証する。
    submitMock.mockResolvedValue({
      ok: false,
      error: {
        code: 'COOLDOWN',
        message: 'このアンケートは前回提出から30日間は再回答できません。',
      },
    });

    render(<SurveyForm survey={makeSurvey()} categories={makeCategories()} existingResponse={null} />);

    // 最終ステップまで進めて送信する
    await user.click(screen.getByRole('radio', { name: '実務で実装・運用したことがある' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '回答を送信する' }));

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('このアンケートは前回提出から30日間は再回答できません。'),
    ).toBeInTheDocument();
  });

  it('ステップ遷移時にページ最上部へスクロールする（初回マウントでは呼ばない）', async () => {
    const user = userEvent.setup();
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      render(<SurveyForm survey={makeSurvey()} categories={makeCategories()} existingResponse={null} />);

      // 初回マウントではスクロールしない
      expect(scrollSpy).not.toHaveBeenCalled();

      // 必須未充足の「次へ」はステップが進まないのでスクロールも発火しない
      await user.click(screen.getByRole('button', { name: '次へ' }));
      expect(scrollSpy).not.toHaveBeenCalled();

      // 回答してステップを進めると最上部（top: 0）へスクロールする
      await user.click(screen.getByRole('radio', { name: '実務で実装・運用したことがある' }));
      await user.click(screen.getByRole('button', { name: '次へ' }));

      expect(screen.getByRole('heading', { name: 'カテゴリB' })).toBeInTheDocument();
      expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      scrollSpy.mockRestore();
    }
  });
});

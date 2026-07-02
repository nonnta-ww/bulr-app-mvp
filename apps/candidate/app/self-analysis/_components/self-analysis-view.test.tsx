// @vitest-environment jsdom
/**
 * SelfAnalysisView UI テスト（task 6.3 / Req 6.1, 6.2, 8.2）
 *
 * 検証フロー:
 *  - 完了状態でレーダー（熟練度）とカバレッジ表示が併存する
 *  - 旧版スナップショット（proficiencyScore を持たない）でもレーダーが空表示で破綻しない
 *
 * GenerateButton は Server Action を import するためモックして DB 依存を遮断する。
 * SkillBalanceRadar は dynamic(ssr:false) で読み込まれるため findBy* で解決を待つ。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CategoryCoverage, SelfAnalysisRecord } from '@bulr/db';

vi.mock('./generate-button', () => ({
  GenerateButton: () => null,
}));

import { SelfAnalysisView } from './self-analysis-view';

afterEach(cleanup);

const D = new Date('2026-06-01T00:00:00Z');

function makeRecord(categories: CategoryCoverage[]): SelfAnalysisRecord {
  return {
    id: 'a1',
    candidateProfileId: 'p1',
    skillSurveyId: 's1',
    sourceResponseId: 'r1',
    sourceSubmittedAt: D,
    aggregatedSnapshot: {
      jobType: 'backend',
      overallCoverageRatio: 1,
      categories,
    },
    llmOutput: { strengths: ['強み1'], weaknesses: ['弱み1'], growthActions: ['アクション1'] },
    metadata: null,
    regenerationCount: 0,
    regenerationWindowStart: D,
    createdAt: D,
    updatedAt: D,
  };
}

const baseCategory = (over: Partial<CategoryCoverage>): CategoryCoverage => ({
  categoryName: 'A',
  answeredQuestions: 1,
  totalQuestions: 1,
  coverageRatio: 1,
  selectedBreadth: 1,
  freeTextPresence: false,
  ...over,
});

describe('SelfAnalysisView — レーダーとカバレッジの併存 (Req 6.1, 6.2, 8.2)', () => {
  it('完了状態で熟練度レーダーとカバレッジ表示が併存する', async () => {
    const record = makeRecord([
      baseCategory({ categoryName: 'プログラミング', proficiencyScore: 80, answeredProficiencyCount: 1 }),
      baseCategory({ categoryName: 'データベース', proficiencyScore: 40, answeredProficiencyCount: 1 }),
    ]);

    render(<SelfAnalysisView record={record} isStale={false} surveyId="s1" />);

    // レーダーセクションの見出し（併置ブロック）
    expect(screen.getByText('スキルバランス（熟練度）')).toBeInTheDocument();
    // 既存カバレッジ表示が維持されている
    expect(screen.getByText('全体の回答網羅度')).toBeInTheDocument();
    // dynamic 読み込みのレーダーが解決し、非空描画される。
    // next/dynamic(ssr:false) + recharts の解決は CI 高負荷時に既定 1000ms を超えうるため
    // タイムアウトを広げてフレークを防ぐ。
    expect(await screen.findByText(/カテゴリ別の熟練度/, undefined, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('旧版スナップショット（proficiencyScore 無し）でもレーダーが空表示で破綻しない', async () => {
    const record = makeRecord([
      baseCategory({ categoryName: 'プログラミング' }), // proficiencyScore 欠落
      baseCategory({ categoryName: 'データベース' }),
    ]);

    render(<SelfAnalysisView record={record} isStale={false} surveyId="s1" />);

    expect(screen.getByText('スキルバランス（熟練度）')).toBeInTheDocument();
    expect(screen.getByText('全体の回答網羅度')).toBeInTheDocument();
    // レーダーは空表示にフォールバック（dynamic 解決待ちのため広めのタイムアウト）
    expect(
      await screen.findByText(/熟練度を表示できるデータがまだありません/, undefined, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * SidePanel コンポーネントのテスト
 *
 * 検証内容:
 *  - カバレッジ進捗（カバー済み/進行中/未着手）と到達段階の表示（Req 3.1）
 *  - 質問候補 3 件の読み取り専用表示と操作レス保証（Req 3.2）
 *  - currentProposal の自動更新：rerender でポーリングをシミュレート（Req 3.2 observable）
 *  - coverage の自動更新（Req 3.1 observable）
 *  - 経過時間（mm:ss）と残りパターン数の表示（Req 3.8）
 *  - 解析上限到達通知（analysisCapped）の表示と非表示（Req 4.5）
 *
 * Requirements: 3.1, 3.2, 3.8, 4.5
 * Design: LiveCaptureRunner / … / SidePanel (Components and Interfaces),
 *         Requirements Traceability 行 3.1/3.2/3.8/4.5, LiveStateAPI
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { PatternCoverageSummary, ProposalView } from '../../../../../lib/capture/live-state';
import { SidePanel } from './side-panel';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeCoverage(
  patternCode: string,
  status: PatternCoverageSummary['status'],
  levelReached: number | null = null,
): PatternCoverageSummary {
  return { patternCode, status, levelReached };
}

function makeProposal(
  candidates: [string, string, string],
  intent = 'deep_dive',
): ProposalView {
  return {
    candidates: [
      { text: candidates[0], intent },
      { text: candidates[1], intent },
      { text: candidates[2], intent },
    ],
    selectedIndex: null,
  };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('SidePanel', () => {
  // -------------------------------------------------------------------------
  // Req 3.1: カバレッジ進捗表示
  // -------------------------------------------------------------------------
  describe('カバレッジ進捗 (Req 3.1)', () => {
    it('covered パターンに「カバー済み」ステータスラベルが表示される', () => {
      render(
        <SidePanel
          coverage={[makeCoverage('P-01', 'covered', 2)]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('カバー済み')).toBeInTheDocument();
    });

    it('in_progress パターンに「進行中」ステータスラベルが表示される', () => {
      render(
        <SidePanel
          coverage={[makeCoverage('P-02', 'in_progress', 1)]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('進行中')).toBeInTheDocument();
    });

    it('not_started パターンに「未着手」ステータスラベルが表示される', () => {
      render(
        <SidePanel
          coverage={[makeCoverage('P-03', 'not_started', null)]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('未着手')).toBeInTheDocument();
    });

    it('covered パターンの到達段階（levelReached）が「段階3」として表示される', () => {
      render(
        <SidePanel
          coverage={[makeCoverage('P-01', 'covered', 3)]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('段階3')).toBeInTheDocument();
    });

    it('in_progress パターンの到達段階（levelReached）が「段階2」として表示される', () => {
      render(
        <SidePanel
          coverage={[makeCoverage('P-02', 'in_progress', 2)]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('段階2')).toBeInTheDocument();
    });

    it('複数ステータスが混在する coverage を正しく表示する', () => {
      const coverage = [
        makeCoverage('P-01', 'covered', 4),
        makeCoverage('P-02', 'in_progress', 2),
        makeCoverage('P-03', 'not_started', null),
      ];
      render(
        <SidePanel
          coverage={coverage}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={1}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('カバー済み')).toBeInTheDocument();
      expect(screen.getByText('進行中')).toBeInTheDocument();
      expect(screen.getByText('未着手')).toBeInTheDocument();
    });

    it('not_started パターンには到達段階が表示されない', () => {
      render(
        <SidePanel
          coverage={[makeCoverage('P-03', 'not_started', null)]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={1}
          analysisCapped={false}
        />,
      );
      // levelReached が null なので「段階」を含む要素は存在しない
      expect(screen.queryByText(/段階/)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.2: 質問候補 3 件の読み取り専用表示（操作レス）
  // -------------------------------------------------------------------------
  describe('質問候補表示（操作レス）(Req 3.2)', () => {
    it('currentProposal がある場合、3件の候補テキストが表示される', () => {
      const proposal = makeProposal(['候補1のテキスト', '候補2のテキスト', '候補3のテキスト']);
      render(
        <SidePanel
          coverage={[]}
          currentProposal={proposal}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('候補1のテキスト')).toBeInTheDocument();
      expect(screen.getByText('候補2のテキスト')).toBeInTheDocument();
      expect(screen.getByText('候補3のテキスト')).toBeInTheDocument();
    });

    it('SidePanel 全体にボタンが存在しない（完全操作レス）', () => {
      const proposal = makeProposal(['候補A', '候補B', '候補C']);
      render(
        <SidePanel
          coverage={[makeCoverage('P-01', 'covered', 1)]}
          currentProposal={proposal}
          elapsedSeconds={60}
          remainingPlannedPatterns={2}
          analysisCapped={false}
        />,
      );
      // 操作レス保証: SidePanel にはボタンが一切存在しない（Req 3.5）
      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('currentProposal が null の場合、準備中状態が表示される', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText(/準備中/)).toBeInTheDocument();
    });

    it('候補の intent ラベル（深掘り等）が表示される', () => {
      const proposal = makeProposal(['テキストA', 'テキストB', 'テキストC'], 'deep_dive');
      render(
        <SidePanel
          coverage={[]}
          currentProposal={proposal}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      // deep_dive → "深掘り" が 3 件分表示される
      expect(screen.getAllByText('深掘り')).toHaveLength(3);
    });

    it('next_pattern intent の候補に「次パターン」ラベルが表示される', () => {
      const proposal = makeProposal(['テキストA', 'テキストB', 'テキストC'], 'next_pattern');
      render(
        <SidePanel
          coverage={[]}
          currentProposal={proposal}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getAllByText('次パターン')).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.2 / 3.1 observable: 自動更新（ポーリングシミュレーション）
  // -------------------------------------------------------------------------
  describe('自動更新（ポーリングシミュレーション）(Req 3.2, 3.1 observable)', () => {
    it('rerender で currentProposal が更新されると新しい候補が表示される（ユーザー操作なし）', () => {
      const proposalA = makeProposal(['A-1', 'A-2', 'A-3']);
      const proposalB = makeProposal(['B-1', 'B-2', 'B-3']);
      const { rerender } = render(
        <SidePanel
          coverage={[]}
          currentProposal={proposalA}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('A-1')).toBeInTheDocument();
      expect(screen.queryByText('B-1')).toBeNull();

      // ポーリング後の候補更新をシミュレート（ユーザー操作なし）
      rerender(
        <SidePanel
          coverage={[]}
          currentProposal={proposalB}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('B-1')).toBeInTheDocument();
      expect(screen.queryByText('A-1')).toBeNull();
    });

    it('rerender で coverage が更新されると新しいステータスが反映される（ユーザー操作なし）', () => {
      const coverageA = [makeCoverage('P-01', 'not_started', null)];
      const coverageB = [makeCoverage('P-01', 'covered', 3)];
      const { rerender } = render(
        <SidePanel
          coverage={coverageA}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={1}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('未着手')).toBeInTheDocument();
      expect(screen.queryByText('カバー済み')).toBeNull();

      rerender(
        <SidePanel
          coverage={coverageB}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('カバー済み')).toBeInTheDocument();
      expect(screen.queryByText('未着手')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.8: 経過時間・残りパターン数
  // -------------------------------------------------------------------------
  describe('経過時間・残りパターン数 (Req 3.8)', () => {
    it('elapsedSeconds が mm:ss 形式でフォーマットされて表示される（125秒 → "02:05"）', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={125}
          remainingPlannedPatterns={3}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('02:05')).toBeInTheDocument();
    });

    it('elapsedSeconds=0 は "00:00" と表示される', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('remainingPlannedPatterns の数値が data-testid="remaining-patterns" 要素に含まれる', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={7}
          analysisCapped={false}
        />,
      );
      expect(screen.getByTestId('remaining-patterns')).toHaveTextContent('7');
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.5: 解析上限到達通知
  // -------------------------------------------------------------------------
  describe('解析上限到達通知 (Req 4.5)', () => {
    it('analysisCapped=true のとき解析上限通知 (role="status" または "alert") が表示される', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={true}
        />,
      );
      const notice = screen.queryByRole('status') ?? screen.queryByRole('alert');
      expect(notice).toBeInTheDocument();
    });

    it('analysisCapped=true の通知テキストに「解析」が含まれる', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={true}
        />,
      );
      const notice = screen.queryByRole('status') ?? screen.queryByRole('alert');
      expect(notice?.textContent).toMatch(/解析/);
    });

    it('analysisCapped=false のとき解析上限通知は表示されない', () => {
      render(
        <SidePanel
          coverage={[]}
          currentProposal={null}
          elapsedSeconds={0}
          remainingPlannedPatterns={0}
          analysisCapped={false}
        />,
      );
      // SidePanel は staleTranscript を持たないため、role="status"/"alert" は
      // analysisCapped=false の場合は存在しない
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

'use client';

/**
 * レポート画面の上位 Client Component。
 * タブの選択状態と、開いているパターン詳細の状態を保持する。
 *
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §3, §12
 */

import './report-print.css';

import { useMemo, useState } from 'react';
import type { HeatmapData } from '@bulr/types/evaluation';
import type { AssessmentPattern, InterviewTurn } from '@bulr/db/schema';

import { VerdictSummary } from './verdict-summary';
import { ObservationTab } from './observation-tab';
import { CoverageTab } from './coverage-tab';
import { PatternDetailPanel } from './pattern-detail-panel';

type TabKey = 'observation' | 'coverage';

interface Props {
  heatmapData: HeatmapData;
  allPatterns: AssessmentPattern[];
  allTurns: InterviewTurn[];
}

export function ReportView({ heatmapData, allPatterns, allTurns }: Props) {
  const [tab, setTab] = useState<TabKey>('observation');
  const [openPatternId, setOpenPatternId] = useState<string | null>(null);

  const openPattern = useMemo(
    () => heatmapData.patterns.find((p) => p.pattern_id === openPatternId) ?? null,
    [heatmapData.patterns, openPatternId],
  );

  const relatedTurns = useMemo(
    () =>
      openPatternId
        ? allTurns
            .filter((t) => t.pattern_id === openPatternId)
            .sort((a, b) => a.sequence_no - b.sequence_no)
        : [],
    [allTurns, openPatternId],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <VerdictSummary heatmapData={heatmapData} />

      <div data-report-tabs className="mt-3 flex border-b border-gray-200 text-sm">
        <TabButton active={tab === 'observation'} onClick={() => setTab('observation')}>
          観察
        </TabButton>
        <TabButton active={tab === 'coverage'} onClick={() => setTab('coverage')}>
          カバレッジ
        </TabButton>
      </div>

      <div className="pt-4">
        <div
          data-report-tab-body="observation"
          style={{ display: tab === 'observation' ? 'block' : 'none' }}
        >
          <ObservationTab
            patterns={heatmapData.patterns}
            onSelectPattern={setOpenPatternId}
          />
        </div>
        <div
          data-report-tab-body="coverage"
          style={{ display: tab === 'coverage' ? 'block' : 'none' }}
        >
          <CoverageTab
            patterns={heatmapData.patterns}
            allPatterns={allPatterns}
            onSelectPattern={setOpenPatternId}
          />
        </div>
      </div>

      <PatternDetailPanel
        pattern={openPattern}
        relatedTurns={relatedTurns}
        onClose={() => setOpenPatternId(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 transition ${
        active
          ? 'border-cyan-600 font-bold text-cyan-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

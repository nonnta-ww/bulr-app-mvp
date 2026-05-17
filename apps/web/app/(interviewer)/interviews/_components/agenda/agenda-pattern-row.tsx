'use client';

import type { AgendaItem } from './types';

export interface AgendaPatternRowProps {
  patternTitle: string;
  items: AgendaItem[];
  taskStatuses: Record<string, { status: 'streaming' | 'completed' | 'errored'; step: string }>;
  onItemClick: (item: AgendaItem) => void;
  onItemAnalysisClick?: (turnId: string) => void;
}

export function AgendaPatternRow({
  patternTitle,
  items,
  taskStatuses,
  onItemClick,
  onItemAnalysisClick,
}: AgendaPatternRowProps) {
  const hasRecording = items.some((i) => i.status === 'recording');
  const hasFuture = items.every((i) => i.status === 'future');
  const allCompleted = items.every((i) => i.status === 'completed');

  const titleColor = hasRecording
    ? 'text-red-700 font-semibold'
    : allCompleted
    ? 'text-green-700'
    : hasFuture
    ? 'text-gray-500'
    : 'text-gray-900 font-semibold';

  return (
    <div className="mb-2">
      <div className={`px-1 py-0.5 text-xs ${titleColor}`}>
        {allCompleted ? '✓ ' : hasRecording ? '▶ ' : ''}
        {patternTitle}
      </div>
      {items.map((item) => {
        const taskStatus = item.analysisTaskId ? (taskStatuses[item.analysisTaskId] ?? null) : null;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick(item)}
            className={[
              'flex w-full items-start gap-1 rounded px-1 py-0.5 pl-4 text-left text-[11px] leading-tight',
              item.status === 'recording' && 'bg-red-50 text-red-700 font-semibold',
              item.status === 'queued' && 'bg-blue-50 text-blue-700',
              item.status === 'asked' && 'text-blue-700',
              item.status === 'completed' && 'text-green-700',
              item.status === 'future' && 'text-gray-500 hover:bg-gray-50',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="flex-1 truncate">{sourceLabel(item.source.kind)}</span>
            {renderBadge(item, taskStatus, onItemAnalysisClick)}
          </button>
        );
      })}
    </div>
  );
}

function sourceLabel(kind: AgendaItem['source']['kind']): string {
  switch (kind) {
    case 'pattern_intro':
      return 'level_1_intro';
    case 'deep_dive':
      return '深掘り';
    case 'meta_cognition':
      return 'メタ認知';
    case 'manual':
      return '手動';
  }
}

function renderBadge(
  item: AgendaItem,
  taskStatus: { status: 'streaming' | 'completed' | 'errored'; step: string } | null,
  onAnalysisClick?: (turnId: string) => void,
) {
  if (item.status === 'recording') {
    return <span className="ml-auto rounded bg-gray-100 px-1 text-[9px]">録音中</span>;
  }
  if (taskStatus?.status === 'streaming') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (item.analysisTaskId && onAnalysisClick) onAnalysisClick(item.analysisTaskId);
        }}
        className="ml-auto rounded bg-amber-100 px-1 text-[9px] text-amber-800"
      >
        分析 {stepIndex(taskStatus.step)}/4
      </button>
    );
  }
  if (taskStatus?.status === 'completed') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (item.analysisTaskId && onAnalysisClick) onAnalysisClick(item.analysisTaskId);
        }}
        className="ml-auto rounded bg-green-100 px-1 text-[9px] text-green-800"
      >
        完了
      </button>
    );
  }
  if (taskStatus?.status === 'errored') {
    return <span className="ml-auto rounded bg-red-100 px-1 text-[9px] text-red-800">⚠</span>;
  }
  if (item.status === 'completed') {
    return <span className="ml-auto rounded bg-green-100 px-1 text-[9px] text-green-800">完了</span>;
  }
  // spec §7: リロード後の "asked だが taskStatus なし" は分析未完了表示
  if (item.status === 'asked' && !taskStatus) {
    return <span className="ml-auto rounded bg-gray-200 px-1 text-[9px] text-gray-700">未分析</span>;
  }
  return null;
}

function stepIndex(step: string): number {
  switch (step) {
    case 'upload': return 1;
    case 'transcribe': return 2;
    case 'analyze': return 3;
    case 'prepare': return 4;
    default: return 1;
  }
}

'use client';

import { useState } from 'react';
import type { AnalysisTask } from './types';

export interface BackgroundAnalysisStripProps {
  tasks: AnalysisTask[];
  elapsedSec: number;
  totalSec: number;
  patternTitleById: (id: string | null) => string;
  onChipClick: (turnId: string) => void;
  onRetry?: (turnId: string) => void;
}

const COMPLETED_DEFAULT_VISIBLE = 2;

export function BackgroundAnalysisStrip({
  tasks,
  elapsedSec,
  totalSec,
  patternTitleById,
  onChipClick,
  onRetry,
}: BackgroundAnalysisStripProps) {
  const [expanded, setExpanded] = useState(false);

  // 新しい順（startedAt desc）
  const sorted = [...tasks].sort((a, b) => b.startedAt - a.startedAt);
  const streaming = sorted.filter((t) => t.status === 'streaming');
  const errored = sorted.filter((t) => t.status === 'errored');
  const completed = sorted.filter((t) => t.status === 'completed');

  const visibleCompleted = expanded
    ? completed
    : completed.slice(0, COMPLETED_DEFAULT_VISIBLE);
  const hiddenCount = completed.length - visibleCompleted.length;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-gray-200 bg-white text-xs"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
        <span className="font-semibold text-gray-600">
          背景タスク{tasks.length > 0 && ` (${tasks.length}件)`}
        </span>
        <span className="text-gray-400">
          {formatTime(elapsedSec)} / {formatTime(totalSec)}
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-3 py-2 text-gray-400">なし</div>
      ) : (
        <ul className="flex flex-col">
          {streaming.map((task) => (
            <TaskRow
              key={task.turnId}
              task={task}
              patternTitleById={patternTitleById}
              onClick={() => onChipClick(task.turnId)}
              onRetry={onRetry}
            />
          ))}
          {errored.map((task) => (
            <TaskRow
              key={task.turnId}
              task={task}
              patternTitleById={patternTitleById}
              onClick={() => onChipClick(task.turnId)}
              onRetry={onRetry}
            />
          ))}
          {visibleCompleted.map((task) => (
            <TaskRow
              key={task.turnId}
              task={task}
              patternTitleById={patternTitleById}
              onClick={() => onChipClick(task.turnId)}
              onRetry={onRetry}
            />
          ))}
          {hiddenCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full border-t border-gray-100 px-3 py-1.5 text-left text-[10px] text-gray-500 hover:bg-gray-50"
              >
                ▼ もっと見る ({hiddenCount} 件)
              </button>
            </li>
          )}
          {expanded && completed.length > COMPLETED_DEFAULT_VISIBLE && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-full border-t border-gray-100 px-3 py-1.5 text-left text-[10px] text-gray-500 hover:bg-gray-50"
              >
                ▲ 折りたたむ
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  patternTitleById,
  onClick,
  onRetry,
}: {
  task: AnalysisTask;
  patternTitleById: (id: string | null) => string;
  onClick: () => void;
  onRetry?: (turnId: string) => void;
}) {
  const icon = task.status === 'streaming' ? '⟳' : task.status === 'completed' ? '✓' : '⚠';
  const colorClass =
    task.status === 'streaming'
      ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
      : task.status === 'completed'
        ? 'bg-green-50 text-green-800 hover:bg-green-100'
        : 'bg-red-50 text-red-800 hover:bg-red-100';
  const label =
    task.status === 'streaming'
      ? `分析中 (${stepIndex(task.step)}/4)`
      : task.status === 'completed'
        ? '分析完了'
        : '失敗';

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`flex cursor-pointer items-center gap-2 border-t border-gray-100 px-3 py-1.5 first:border-t-0 focus:outline-none focus:ring-1 focus:ring-blue-400 ${colorClass}`}
    >
      <span className="w-4 text-center">{icon}</span>
      <span className="flex-1 truncate">{patternTitleById(task.patternId)}</span>
      <span className="text-[10px]">{label}</span>
      {task.status === 'errored' && onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry(task.turnId);
          }}
          className="ml-1 cursor-pointer text-[10px] text-red-700 underline hover:text-red-900"
        >
          [再試行]
        </button>
      )}
    </li>
  );
}

function stepIndex(step: string): number {
  switch (step) {
    case 'upload':
      return 1;
    case 'transcribe':
      return 2;
    case 'analyze':
      return 3;
    case 'prepare':
      return 4;
    default:
      return 1;
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

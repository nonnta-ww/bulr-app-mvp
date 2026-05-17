'use client';

import type { AnalysisTask } from './types';

export interface BackgroundAnalysisStripProps {
  tasks: AnalysisTask[];
  elapsedSec: number;
  totalSec: number;
  patternTitleById: (id: string | null) => string;
  onChipClick: (turnId: string) => void;
}

export function BackgroundAnalysisStrip({
  tasks,
  elapsedSec,
  totalSec,
  patternTitleById,
  onChipClick,
}: BackgroundAnalysisStripProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs"
    >
      <span className="font-semibold text-gray-600">背景タスク:</span>
      {tasks.length === 0 && <span className="text-gray-400">なし</span>}
      {tasks.map((task) => (
        <button
          key={task.turnId}
          type="button"
          onClick={() => onChipClick(task.turnId)}
          className={[
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
            task.status === 'streaming' && 'border-amber-300 bg-amber-50 text-amber-800',
            task.status === 'completed' && 'border-green-300 bg-green-50 text-green-800',
            task.status === 'errored' && 'border-red-300 bg-red-50 text-red-800',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {task.status === 'streaming' && '⟳'}
          {task.status === 'completed' && '✓'}
          {task.status === 'errored' && '⚠'}
          <span>
            {patternTitleById(task.patternId)} {labelForStatus(task)}
          </span>
        </button>
      ))}
      <span className="ml-auto text-gray-400">
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </div>
  );
}

function labelForStatus(task: AnalysisTask): string {
  if (task.status === 'streaming') return `分析中 (${stepIndex(task.step)}/4)`;
  if (task.status === 'completed') return '分析完了';
  return '失敗';
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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

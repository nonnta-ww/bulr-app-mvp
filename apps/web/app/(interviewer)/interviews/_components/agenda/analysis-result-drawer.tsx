'use client';

import { InterviewProgressSteps } from '../interview-progress-steps';
import type { AnalysisTask } from './types';

export interface AnalysisResultDrawerProps {
  task: AnalysisTask | null;
  patternTitleById: (id: string | null) => string;
  onClose: () => void;
}

export function AnalysisResultDrawer({
  task,
  patternTitleById,
  onClose,
}: AnalysisResultDrawerProps) {
  if (!task) return null;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-gray-200 bg-white p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {patternTitleById(task.patternId)} 分析結果
        </h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="Drawer を閉じる"
          className="text-gray-400 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      {task.status === 'streaming' && (
        <div className="mb-2">
          <InterviewProgressSteps currentStep={task.step} compact />
        </div>
      )}

      {task.status === 'errored' && (
        <div className="mb-2 rounded bg-red-50 p-2 text-red-800">
          ⚠ 分析失敗: {task.error ?? 'unknown'}
        </div>
      )}

      {task.transcript && (
        <>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-gray-500">
            トランスクリプト
          </div>
          <div className="mb-2 max-h-40 overflow-y-auto rounded bg-gray-50 p-2 text-gray-700">
            {task.transcript}
          </div>
        </>
      )}

      {task.analysisNotes && (
        <>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-gray-500">分析メモ</div>
          <div className="mb-2 rounded bg-gray-50 p-2 text-gray-700">
            {task.analysisNotes}
          </div>
        </>
      )}

      {task.candidates && task.candidates.length > 0 && (
        <>
          <div className="mb-1 text-[9px] uppercase tracking-wide text-gray-500">
            提案候補（再確認）
          </div>
          {task.candidates.map((c, idx) => (
            <div
              key={idx}
              className="mb-1 rounded border border-gray-200 bg-white p-2 text-[11px]"
            >
              <span className="mb-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[9px]">
                {c.intent === 'deep_dive' ? '深掘り' : c.intent === 'meta_cognition' ? 'メタ認知' : '次パターン'}
              </span>
              <div>{c.text}</div>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

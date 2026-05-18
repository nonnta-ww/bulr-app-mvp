'use client';

import { useState } from 'react';
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
    <aside className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white p-3 text-base">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-lg font-semibold">
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
        <div className="mb-3">
          <InterviewProgressSteps currentStep={task.step} compact />
        </div>
      )}

      {task.status === 'errored' && (
        <div className="mb-3 rounded bg-red-50 p-3 text-red-800">
          ⚠ 分析失敗: {task.error ?? 'unknown'}
        </div>
      )}

      {task.questionText && (
        <div className="mb-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">質問</div>
          <div className="whitespace-pre-wrap break-words rounded bg-blue-50 p-3 text-base leading-relaxed text-gray-900">
            {task.questionText}
          </div>
        </div>
      )}

      {task.transcript && (
        <CollapsibleText
          label="トランスクリプト"
          content={task.transcript}
          // task.id 単位に state を維持するため key を渡す
          key={`transcript-${task.turnId}`}
        />
      )}

      {task.analysisNotes && (
        <CollapsibleText
          label="分析メモ"
          content={task.analysisNotes}
          key={`notes-${task.turnId}`}
        />
      )}

      {task.candidates && task.candidates.length > 0 && (
        <>
          <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
            提案候補（再確認）
          </div>
          {task.candidates.map((c, idx) => (
            <div
              key={idx}
              className="mb-2 rounded border border-gray-200 bg-white p-3 text-sm leading-relaxed"
            >
              <span className="mb-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                {c.intent === 'deep_dive'
                  ? '深掘り'
                  : c.intent === 'meta_cognition'
                    ? 'メタ認知'
                    : '次パターン'}
              </span>
              <div>{c.text}</div>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

/**
 * 長文を折りたたみ表示できる小ブロック。
 * - 閉じ: 2 行までの line-clamp プレビュー + 「▼ 全文を見る」
 * - 開き: 高さ可変（最大 60vh）でスクロール表示 + 「▲ 閉じる」
 */
function CollapsibleText({ label, content }: { label: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {expanded ? '▲ 閉じる' : '▼ 全文を見る'}
        </button>
      </div>
      <div
        className={[
          'whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-base leading-relaxed text-gray-700',
          expanded ? 'max-h-[60vh] overflow-y-auto' : 'line-clamp-6 cursor-pointer',
        ].join(' ')}
        // 閉じている状態のテキストエリアをクリックでも展開できるように
        onClick={!expanded ? () => setExpanded(true) : undefined}
      >
        {content}
      </div>
    </div>
  );
}

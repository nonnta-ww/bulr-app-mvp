'use client';

import { useState } from 'react';
import type { AgendaItem, AnalysisCandidate, AnalysisTask, NextQuestionDraft } from './types';

export interface NextQuestionPickerProps {
  draft: NextQuestionDraft;
  /** 候補3つを表示するタスク（通常 draft.fromAnalysisTaskId の指すタスク） */
  displayedTask: AnalysisTask | null;
  futureItems: AgendaItem[];
  onDraftChange: (draft: NextQuestionDraft) => void;
  onStartRecording: () => void;
  onSwitchToNewerCandidates?: (taskId: string) => void;
  /** displayedTask より新しい完了タスクが存在する場合に設定される。[切替] リンクの表示制御 */
  newCandidatesAvailable: { taskId: string } | null;
}

export function NextQuestionPicker({
  draft,
  displayedTask,
  futureItems,
  onDraftChange,
  onStartRecording,
  onSwitchToNewerCandidates,
  newCandidatesAvailable,
}: NextQuestionPickerProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState(
    draft.source.kind === 'manual' ? draft.questionText : '',
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          分析が出した次の候補
          {displayedTask && ` (${displayedTask.turnId.slice(0, 6)} 由来)`}
        </h4>
        {newCandidatesAvailable && (
          <button
            type="button"
            onClick={() => onSwitchToNewerCandidates?.(newCandidatesAvailable.taskId)}
            className="mb-2 text-xs text-blue-600 underline"
          >
            ✨ 新しい候補が届きました [切替]
          </button>
        )}
        {!displayedTask?.candidates && (
          <p className="text-xs text-gray-400">直前の分析を待機中、または分析履歴がありません。</p>
        )}
        {displayedTask?.candidates?.map((c, idx) => (
          <CandidateRow
            key={idx}
            candidate={c}
            selected={draft.questionText === c.text}
            onClick={() => onDraftChange(buildDraftFromCandidate(c, displayedTask))}
          />
        ))}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          または agenda から直接
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {futureItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onDraftChange({
                  questionText: item.questionText,
                  source: item.source,
                  patternId: item.patternId,
                  fromAnalysisTaskId: null,
                })
              }
              className={[
                'rounded border px-2 py-0.5 text-[11px]',
                draft.questionText === item.questionText
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {item.patternTitle}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
          >
            + 自分で入力
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onStartRecording}
            disabled={draft.questionText.trim() === ''}
            className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:bg-gray-300"
          >
            この質問で録音開始
          </button>
        </div>
      </section>

      {manualOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setManualOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-semibold">手動で質問を入力</h3>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={4}
              className="w-full rounded border border-gray-200 p-2 text-sm"
              placeholder="質問を入力..."
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={manualText.trim() === ''}
                onClick={() => {
                  onDraftChange({
                    questionText: manualText.trim(),
                    source: { kind: 'manual', parentTurnId: null },
                    patternId: null,
                    fromAnalysisTaskId: null,
                  });
                  setManualOpen(false);
                }}
                className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:bg-gray-300"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateRow({
  candidate,
  selected,
  onClick,
}: {
  candidate: AnalysisCandidate;
  selected: boolean;
  onClick: () => void;
}) {
  const intentBadge = {
    deep_dive: 'bg-violet-100 text-violet-800',
    meta_cognition: 'bg-pink-100 text-pink-800',
    next_pattern: 'bg-blue-100 text-blue-800',
  }[candidate.intent];
  const intentLabel = {
    deep_dive: '深掘り',
    meta_cognition: 'メタ認知',
    next_pattern: '次パターン',
  }[candidate.intent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'mb-1 block w-full rounded border p-2 text-left text-xs',
        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50',
      ].join(' ')}
    >
      <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] ${intentBadge}`}>
        {intentLabel}
      </span>
      <div>{candidate.text}</div>
    </button>
  );
}

function candidateSource(c: AnalysisCandidate, parentTurnId: string) {
  if (c.intent === 'deep_dive') return { kind: 'deep_dive' as const, parentTurnId };
  if (c.intent === 'meta_cognition') return { kind: 'meta_cognition' as const, parentTurnId };
  if (c.patternId) return { kind: 'pattern_intro' as const, patternId: c.patternId };
  return { kind: 'manual' as const, parentTurnId };
}

/**
 * 候補からNextQuestionDraftを構築するヘルパー。
 * deep_dive / meta_cognition は候補側に patternId が無いため、親タスクの patternId を継承する。
 */
export function buildDraftFromCandidate(
  c: AnalysisCandidate,
  task: AnalysisTask,
): NextQuestionDraft {
  // deep_dive / meta_cognition は親パターンを継承（候補側に patternId が無いため）
  const inheritedPatternId =
    c.intent === 'deep_dive' || c.intent === 'meta_cognition' ? task.patternId : c.patternId;
  return {
    questionText: c.text,
    source: candidateSource(c, task.turnId),
    patternId: inheritedPatternId,
    fromAnalysisTaskId: task.turnId,
  };
}

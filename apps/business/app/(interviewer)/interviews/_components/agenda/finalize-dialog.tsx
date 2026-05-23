'use client';

import type { AnalysisTask } from './types';

export type FinalizeDialogMode = 'confirm' | 'waiting';

export interface FinalizeDialogProps {
  open: boolean;
  mode: FinalizeDialogMode;
  pendingTasks: AnalysisTask[]; // status === 'streaming' のみ
  patternTitleById: (id: string | null) => string;
  onWait: () => void;
  onForceClose: () => void;
  onCancel: () => void;
}

export function FinalizeDialog({
  open,
  mode,
  pendingTasks,
  patternTitleById,
  onWait,
  onForceClose,
  onCancel,
}: FinalizeDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        {mode === 'confirm' ? (
          <ConfirmContent
            pendingTasks={pendingTasks}
            patternTitleById={patternTitleById}
            onWait={onWait}
            onForceClose={onForceClose}
            onCancel={onCancel}
          />
        ) : (
          <WaitingContent
            pendingTasks={pendingTasks}
            patternTitleById={patternTitleById}
            onForceClose={onForceClose}
          />
        )}
      </div>
    </div>
  );
}

function ConfirmContent({
  pendingTasks,
  patternTitleById,
  onWait,
  onForceClose,
  onCancel,
}: {
  pendingTasks: AnalysisTask[];
  patternTitleById: (id: string | null) => string;
  onWait: () => void;
  onForceClose: () => void;
  onCancel: () => void;
}) {
  const hasPending = pendingTasks.length > 0;
  return (
    <>
      <h3 className="mb-2 text-base font-semibold">面接を終了しますか？</h3>
      {hasPending ? (
        <>
          <p className="mb-2 text-sm text-gray-700">
            {pendingTasks.length} 件の分析が未完了です。完了を待つと、レポートに最新の分析結果が反映されます。
          </p>
          <TaskList tasks={pendingTasks} patternTitleById={patternTitleById} />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-gray-200 px-3 py-1.5 text-xs"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onForceClose}
              className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              待たずに終了
            </button>
            <button
              type="button"
              onClick={onWait}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              分析完了を待つ
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-700">すべての分析が完了しています。</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-gray-200 px-3 py-1.5 text-xs"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onForceClose}
              className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              終了する
            </button>
          </div>
        </>
      )}
    </>
  );
}

function WaitingContent({
  pendingTasks,
  patternTitleById,
  onForceClose,
}: {
  pendingTasks: AnalysisTask[];
  patternTitleById: (id: string | null) => string;
  onForceClose: () => void;
}) {
  return (
    <>
      <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        分析完了を待っています...
      </h3>
      <p className="mb-2 text-sm text-gray-700">残り {pendingTasks.length} 件</p>
      <TaskList tasks={pendingTasks} patternTitleById={patternTitleById} />
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onForceClose}
          className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
        >
          待たずに終了する
        </button>
      </div>
    </>
  );
}

function TaskList({
  tasks,
  patternTitleById,
}: {
  tasks: AnalysisTask[];
  patternTitleById: (id: string | null) => string;
}) {
  return (
    <ul className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs">
      {tasks.map((t) => (
        <li key={t.turnId} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span>{patternTitleById(t.patternId)}</span>
          <span className="ml-auto text-gray-500">{stepLabel(t.step)}</span>
        </li>
      ))}
    </ul>
  );
}

function stepLabel(step: string): string {
  switch (step) {
    case 'upload': return '1/4 アップロード';
    case 'transcribe': return '2/4 文字起こし';
    case 'analyze': return '3/4 分析';
    case 'prepare': return '4/4 次質問準備';
    default: return step;
  }
}

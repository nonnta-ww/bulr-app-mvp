'use client';

/**
 * InterviewProgressSteps Component
 *
 * 「次の質問へ」ボタン押下後の待機画面に表示する処理ステップ進捗 UI。
 * 4 ステップ（音声アップロード・文字起こし・回答分析・次質問準備）の
 * 各状態（待機 / 処理中 / 完了）を視覚的に表示する純粋表示コンポーネント。
 *
 * Requirements: 1.1, 1.3
 */

import type { ProgressStep } from '@/lib/interview/turns-next-events';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'upload' as const, label: '音声のアップロード' },
  { key: 'transcribe' as const, label: '音声の文字起こし' },
  { key: 'analyze' as const, label: '回答の分析' },
  { key: 'prepare' as const, label: '次の質問の準備' },
] satisfies ReadonlyArray<{ key: ProgressStep; label: string }>;

const STEP_ORDER: ProgressStep[] = ['upload', 'transcribe', 'analyze', 'prepare'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InterviewProgressStepsProps {
  /** サーバーから最後に受信した progress.step */
  currentStep: ProgressStep;
}

// ---------------------------------------------------------------------------
// InterviewProgressSteps Component
// ---------------------------------------------------------------------------

export function InterviewProgressSteps({ currentStep }: InterviewProgressStepsProps) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-white p-8 shadow-md">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="text-sm font-semibold text-gray-500">処理中...</span>
      </div>

      {/* ステップリスト */}
      <div className="flex flex-col gap-4">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          // idx > currentIdx = 待機

          return (
            <div key={step.key} className="flex items-center gap-3">
              {/* 状態インジケーター */}
              {isDone && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              {isCurrent && (
                <div
                  className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
                  aria-label="処理中"
                />
              )}
              {!isDone && !isCurrent && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400">
                  {idx + 1}
                </span>
              )}

              {/* ラベル */}
              <span
                className={
                  isDone
                    ? 'text-sm text-gray-400 line-through'
                    : isCurrent
                      ? 'text-sm font-semibold text-blue-600'
                      : 'text-sm text-gray-400'
                }
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

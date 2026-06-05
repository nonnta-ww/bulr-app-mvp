'use client';

/**
 * SurveyProgress — 進捗インジケータコンポーネント（presentational）
 *
 * ウィザードフォームの上部に表示し、現在位置とカテゴリ回答状態を可視化する。
 * - 現在位置: 「カテゴリ {currentStepIndex + 1} / {steps.length}」と現在カテゴリ名
 * - 水平ステップインジケータ: 各ステップを丸ドットで表示し、回答状態と現在位置を色で区別する
 * - 各カテゴリの回答状態: categoryStatus() で '回答済み' / '未回答' を判定し視覚表示
 *
 * Pure presentational: データ取得・state・副作用なし。すべて props から導出する。
 *
 * Requirements: 8.2, 8.3
 * Boundary: SurveyProgress
 */

import { categoryStatus } from '../_lib/survey-structure';
import type { SurveyStep, AnswerState } from '../_lib/survey-structure';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyProgressProps {
  steps: SurveyStep[];
  answers: Record<string, AnswerState>;
  currentStepIndex: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyProgress({ steps, answers, currentStepIndex }: SurveyProgressProps) {
  const total = steps.length;
  const currentStep = steps[currentStepIndex];
  const currentCategoryName = currentStep?.categoryName ?? '';

  // 進捗バーの幅（0〜100%）。最初のステップでは 0、最後は 100%。
  const progressPercent = total <= 1 ? 100 : (currentStepIndex / (total - 1)) * 100;

  return (
    <div className="mb-6 space-y-3">
      {/* カテゴリ位置テキストと現在カテゴリ名 */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-800">
          <span className="text-blue-600">カテゴリ {currentStepIndex + 1}</span>
          <span className="text-gray-400"> / {total}</span>
        </p>
        <p className="text-sm font-semibold text-gray-700">{currentCategoryName}</p>
      </div>

      {/* 水平進捗バー */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`${total} カテゴリ中 ${currentStepIndex + 1} 番目`}
        />
      </div>

      {/* ステップドット — 各カテゴリの回答状態 */}
      <ol className="flex flex-wrap gap-1.5" aria-label="カテゴリ一覧">
        {steps.map((step, index) => {
          const status = categoryStatus(step, answers);
          const isCurrent = index === currentStepIndex;
          const isAnswered = status === 'answered';

          // 各ステップのスタイル決定:
          // - 現在ステップ: 青塗り + リング
          // - 回答済み: 緑塗り
          // - 未回答: 灰色アウトライン
          let dotClass: string;
          if (isCurrent) {
            dotClass =
              'h-4 w-4 rounded-full bg-blue-600 ring-2 ring-blue-300 ring-offset-1 flex-shrink-0';
          } else if (isAnswered) {
            dotClass = 'h-4 w-4 rounded-full bg-green-500 flex-shrink-0';
          } else {
            dotClass = 'h-4 w-4 rounded-full border-2 border-gray-300 bg-white flex-shrink-0';
          }

          const statusLabel = isAnswered ? '回答済み' : '未回答';

          return (
            <li key={step.categoryName} className="flex items-center">
              <span
                className={dotClass}
                title={`${step.categoryName}（${isCurrent ? '現在' : statusLabel}）`}
                aria-label={`${step.categoryName}: ${isCurrent ? '現在表示中' : statusLabel}`}
              />
            </li>
          );
        })}
      </ol>

      {/* カテゴリ凡例（アクセシビリティ補足） */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-600" />
          現在
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
          回答済み
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 bg-white" />
          未回答
        </span>
      </div>
    </div>
  );
}

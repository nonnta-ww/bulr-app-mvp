'use client';

/**
 * SurveyProgress — 進捗インジケータコンポーネント（presentational）
 *
 * ウィザードフォーム上部に表示し、現在のカテゴリ位置と完了率を可視化する。
 * - 現在位置: 「カテゴリ {currentStepIndex + 1} / {steps.length}」
 * - 完了率: (currentStepIndex + 1) / total（例: カテゴリ 3 / 10 → 30% 完了）
 * - オレンジの水平進捗バー
 *
 * Pure presentational: データ取得・state・副作用なし。すべて props から導出する。
 *
 * Requirements: 8.2, 8.3
 * Boundary: SurveyProgress
 */

import type { SurveyStep } from '../_lib/survey-structure';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyProgressProps {
  steps: SurveyStep[];
  currentStepIndex: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyProgress({ steps, currentStepIndex }: SurveyProgressProps) {
  const total = steps.length;

  // 完了率（0〜100%）。現在カテゴリ位置 / 総カテゴリ数。
  const percent = total <= 0 ? 0 : Math.round(((currentStepIndex + 1) / total) * 100);

  return (
    <div className="mb-8 space-y-3">
      {/* カテゴリ位置テキストと完了率 */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink">
          カテゴリ {currentStepIndex + 1}
          <span className="text-muted"> / {total}</span>
        </p>
        <p className="text-sm font-medium text-slate">{percent}% 完了</p>
      </div>

      {/* 水平進捗バー */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`${total} カテゴリ中 ${currentStepIndex + 1} 番目`}
        />
      </div>
    </div>
  );
}

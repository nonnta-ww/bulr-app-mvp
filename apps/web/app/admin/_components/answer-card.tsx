/**
 * パターン回答カードコンポーネント
 *
 * セッション詳細画面で 1 パターンカバレッジ分の評価情報を表示する
 * Server Component。EvalComparison と ManualEvalForm を内包する。
 *
 * Requirements: 4.7
 * Boundary: AnswerCard (this file only)
 */

import type { SessionDetailCoverage } from '@bulr/db/queries/admin';

import { STUCK_TYPE_LABEL } from '@/lib/stuck-type-label';

import { EvalComparison } from './eval-comparison';
import { ManualEvalForm } from './manual-eval-form';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  coverage: SessionDetailCoverage;
};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** アセスメントパターンの最大レベル数（level_1_intro 〜 level_4_focus） */
const MAX_LEVEL = 4;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * stuck_type 値を日本語ラベルに変換する。
 * null の場合は「詰まりなし」を返す。
 */
function stuckTypeLabel(
  stuckType: SessionDetailCoverage['stuckType'],
): string {
  if (stuckType === null) return '詰まりなし';
  return STUCK_TYPE_LABEL[stuckType] ?? stuckType;
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function AnswerCard({ coverage }: Props) {
  const { pattern, levelReached, stuckType, llmEvaluation, manualEvaluation } =
    coverage;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-6">
      {/* カードヘッダー */}
      <header className="flex flex-col gap-1 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          {/* パターンコード */}
          <span className="text-lg font-bold text-gray-900">{pattern.code}</span>
          {/* パターンタイトル */}
          <span className="text-base text-gray-600">{pattern.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
          {/* 到達レベル */}
          <span>
            到達レベル:{' '}
            <span className="font-semibold text-gray-900">
              {levelReached} / {MAX_LEVEL}
            </span>
          </span>

          {/* 詰まり種別 */}
          <span>
            詰まり:{' '}
            <span className="font-semibold text-gray-900">
              {stuckTypeLabel(stuckType)}
            </span>
          </span>
        </div>
      </header>

      {/* LLM vs 手動 評価比較 */}
      <EvalComparison llm={llmEvaluation} manual={manualEvaluation} />

      {/* 手動評価フォーム */}
      <ManualEvalForm
        patternCoverageId={coverage.id}
        initial={manualEvaluation}
        llmEvaluation={llmEvaluation}
      />
    </article>
  );
}

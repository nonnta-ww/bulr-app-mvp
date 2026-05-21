/**
 * LLM vs 手動評価 並列比較表コンポーネント
 *
 * 5 次元（authenticity / judgment / scope / meta_cognition / ai_literacy）を行とし、
 * 列に「LLM」「手動」「差分」を表示する Server Component。
 * 差分 != 0 の行を bg-yellow-50 でハイライト。
 * 採用推奨フィールドは含まない（requirements 7.8）。
 *
 * Requirements: 7.1-7.8
 * Boundary: EvalComparison (this file only)
 */

import type { LlmEvaluation, ManualEvaluation } from '@bulr/types/evaluation';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  llm: LlmEvaluation;
  manual?: ManualEvaluation | null;
};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

type Dim = 'authenticity' | 'judgment' | 'scope' | 'meta_cognition' | 'ai_literacy';

const DIMENSIONS: { key: Dim; label: string }[] = [
  { key: 'authenticity', label: '真贋' },
  { key: 'judgment', label: '判断' },
  { key: 'scope', label: '範囲' },
  { key: 'meta_cognition', label: 'メタ認知' },
  { key: 'ai_literacy', label: 'AI リテラシー' },
];

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function formatDiff(diff: number): string {
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function EvalComparison({ llm, manual }: Props) {
  return (
    <section aria-labelledby="eval-comparison-heading">
      <h2
        id="eval-comparison-heading"
        className="mb-3 text-base font-semibold text-gray-900"
      >
        LLM vs 手動 比較
      </h2>

      {/* 比較表 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 tracking-wide"
              >
                次元
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right font-medium text-gray-500 tracking-wide"
              >
                LLM
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right font-medium text-gray-500 tracking-wide"
              >
                手動
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right font-medium text-gray-500 tracking-wide"
              >
                差分
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {DIMENSIONS.map(({ key, label }) => {
              const llmScore = llm[key];
              const manualScore = manual != null ? manual[key] : null;
              const diff = manualScore != null ? manualScore - llmScore : null;
              const isHighlighted = diff !== null && diff !== 0;

              return (
                <tr
                  key={key}
                  className={isHighlighted ? 'bg-yellow-50' : undefined}
                >
                  <td className="px-4 py-3 font-medium text-gray-700">{label}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {llmScore}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {manualScore != null ? manualScore : '-'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {diff !== null ? formatDiff(diff) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* フッター: notes / 日時 / reviewer */}
      <div className="mt-4 space-y-3 text-sm text-gray-700">
        {/* LLM notes */}
        {llm.notes && (
          <div>
            <p className="font-medium text-gray-500">LLM メモ</p>
            <p className="mt-1 whitespace-pre-wrap">{llm.notes}</p>
          </div>
        )}

        {/* 手動 notes */}
        {manual?.notes && (
          <div>
            <p className="font-medium text-gray-500">手動メモ</p>
            <p className="mt-1 whitespace-pre-wrap">{manual.notes}</p>
          </div>
        )}

        {/* 日時・reviewer */}
        <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-500">
          <p>
            <span className="font-medium">LLM 評価日時:</span>{' '}
            {new Date(llm.evaluated_at).toLocaleString('ja-JP')}
          </p>
          {manual && (
            <>
              <p>
                <span className="font-medium">手動レビュー日時:</span>{' '}
                {new Date(manual.reviewed_at).toLocaleString('ja-JP')}
              </p>
              <p>
                <span className="font-medium">レビュアー:</span> {manual.reviewer}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

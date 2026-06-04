/**
 * LLM コスト推定（純関数）
 *
 * usage（input/output トークン数）から estimated_usd を算出する。
 * 副作用・I/O なし。同一入力→同一出力。
 *
 * Boundary: cost
 * Requirements: 9.1, 9.2
 */

/** claude-sonnet-4-6 input pricing: $3 per 1M tokens */
export const SELF_ANALYSIS_INPUT_USD_PER_M = 3;

/** claude-sonnet-4-6 output pricing: $15 per 1M tokens */
export const SELF_ANALYSIS_OUTPUT_USD_PER_M = 15;

/**
 * LLM usage からコストを推定する純関数。
 *
 * estimated_usd = (input_tokens * 3 + output_tokens * 15) / 1_000_000
 *
 * @param usage - LLM が返す usage オブジェクト
 * @returns 推定コスト（USD）
 */
export function estimateUsd(usage: {
  input_tokens: number;
  output_tokens: number;
}): number {
  return (
    (usage.input_tokens * SELF_ANALYSIS_INPUT_USD_PER_M +
      usage.output_tokens * SELF_ANALYSIS_OUTPUT_USD_PER_M) /
    1_000_000
  );
}

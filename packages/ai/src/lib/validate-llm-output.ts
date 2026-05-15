// Requirements 14.1–14.8, 8.12
import type { LlmAnalysis, LlmEvaluation, HeatmapData } from '@bulr/types/evaluation';
import { z } from 'zod';

// Requirement 14.1: validateAndFallback generic helper
// Requirement 14.2: logs context-aware console.error on parse failure
// Requirement 14.3: returns fallback value without throwing
export function validateAndFallback<T>(
  output: unknown,
  schema: z.ZodSchema<T>,
  fallback: T,
  context: string,
): T {
  const result = schema.safeParse(output);
  if (!result.success) {
    console.error(
      `[validateAndFallback] Zod validation failed (context: ${context}):`,
      result.error.issues,
    );
    return fallback;
  }
  return result.data;
}

// Requirement 14.4: SAFE_LLM_ANALYSIS_FALLBACK
// All signals are 'absent', scope_signal=null, level_reached_estimate=0,
// pattern_match_confidence='off_pattern'. M3: must satisfy the full
// analyzeTurnOutputSchema, including matched_pattern_id and stuck_signal.
export const SAFE_LLM_ANALYSIS_FALLBACK: LlmAnalysis = {
  signals: {
    authenticity: 'absent',
    judgment: 'absent',
    meta_cognition: 'absent',
    ai_literacy: 'absent',
  },
  scope_signal: null,
  level_reached_estimate: 0,
  pattern_match_confidence: 'off_pattern',
  matched_pattern_id: null,
  stuck_signal: null,
  notes: 'LLM 出力検証失敗、安全側フォールバック',
};

// Requirement 14.5: SAFE_LLM_EVALUATION_FALLBACK
export const SAFE_LLM_EVALUATION_FALLBACK: LlmEvaluation = {
  authenticity: 0,
  judgment: 0,
  scope: 1,
  meta_cognition: 0,
  ai_literacy: 0,
  level_reached: 0,
  stuck_type: null,
  notes: 'LLM 評価検証失敗',
  evaluated_at: new Date().toISOString(),
};

// Requirement 14.6: SAFE_PROPOSAL_FALLBACK
// 3 candidates, at least 1 with intent 'next_pattern'
export const SAFE_PROPOSAL_FALLBACK: {
  candidates: Array<{
    text: string;
    intent: 'deep_dive' | 'meta_cognition' | 'next_pattern';
  }>;
} = {
  candidates: [
    {
      text: 'その経験を振り返ったとき、自分の判断プロセスについてどのように評価しますか？',
      intent: 'meta_cognition',
    },
    {
      text: 'その状況で、他にどのようなアプローチが考えられましたか？',
      intent: 'meta_cognition',
    },
    {
      text: '次のテーマに移りましょう。これまでの経験で特に印象的だった技術的な挑戦はありますか？',
      intent: 'next_pattern',
    },
  ],
};

// Requirement 14.7: SAFE_SESSION_REPORT_FALLBACK
const _zeroCategory = {
  avg_authenticity: 0,
  avg_judgment: 0,
  avg_scope: 0,
  avg_meta_cognition: 0,
  avg_ai_literacy: 0,
  pattern_count: 0,
};

const _safeHeatmapData: HeatmapData = {
  by_category: {
    design: { ..._zeroCategory },
    trouble: { ..._zeroCategory },
    performance: { ..._zeroCategory },
    security: { ..._zeroCategory },
    organization: { ..._zeroCategory },
    ai: { ..._zeroCategory },
  },
  scope_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  ai_literacy_distribution: { 0: 0, 1: 0, 2: 0, 3: 0 },
  free_question_count: 0,
};

export const SAFE_SESSION_REPORT_FALLBACK: {
  heatmap_data: HeatmapData;
  summary_text: string;
  generated_at: string;
} = {
  heatmap_data: _safeHeatmapData,
  summary_text: 'レポート生成失敗、面接官は管理画面で原データを確認してください',
  generated_at: new Date().toISOString(),
};

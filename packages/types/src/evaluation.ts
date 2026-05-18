// Requirement 1.4
export type StuckType = 'not_experienced' | 'shallow' | 'single_option' | 'rigid';

// Requirement 1.5
export type PatternMatchConfidence = 'exact' | 'inferred_high' | 'inferred_low' | 'off_pattern';

// Requirement 1.6
export type QuestionIntent = 'deep_dive' | 'meta_cognition' | 'next_pattern';

// Requirement 1.3 (used by LlmAnalysis and LlmEvaluation)
export type PatternCategory = 'design' | 'trouble' | 'performance' | 'security' | 'organization' | 'ai';

type SignalValue = 'observed' | 'partial' | 'absent';

// Requirement 1.7
export interface LlmAnalysis {
  signals: {
    authenticity: SignalValue;
    judgment: SignalValue;
    meta_cognition: SignalValue;
    ai_literacy: SignalValue;
  };
  scope_signal: 1 | 2 | 3 | 4 | 5 | null;
  level_reached_estimate: 0 | 1 | 2 | 3 | 4;
  pattern_match_confidence: PatternMatchConfidence;
  // Requirement 24.1 / M4: keep the LlmAnalysis type in sync with analyzeTurnOutputSchema
  // so callers do not need `as unknown as` casts to read these fields.
  matched_pattern_id: string | null;
  stuck_signal: StuckType | null;
  nearest_patterns?: string[];
  off_pattern_summary?: string;
  notes: string;
}

// Requirement 1.8
export interface LlmEvaluation {
  authenticity: 0 | 1 | 2 | 3;
  judgment: 0 | 1 | 2 | 3;
  scope: 1 | 2 | 3 | 4 | 5;
  meta_cognition: 0 | 1 | 2 | 3;
  ai_literacy: 0 | 1 | 2 | 3;
  level_reached: 0 | 1 | 2 | 3 | 4;
  stuck_type: StuckType | null;
  notes: string;
  evaluated_at: string;
}

// Requirement 1.9
export type ManualEvaluation = Omit<LlmEvaluation, 'evaluated_at'> & {
  reviewer: string;
  reviewed_at: string;
};

// Requirement 1.10
export interface HeatmapData {
  by_category: Record<
    PatternCategory,
    {
      avg_authenticity: number;
      avg_judgment: number;
      avg_scope: number;
      avg_meta_cognition: number;
      avg_ai_literacy: number;
      pattern_count: number;
    }
  >;
  scope_distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  ai_literacy_distribution: Record<0 | 1 | 2 | 3, number>;
  free_question_count: number;

  // --- v2 追加 (2026-05-18 redesign) ---
  overall: {
    avg_authenticity: number;
    avg_judgment: number;
    avg_scope: number;
    avg_meta_cognition: number;
    avg_ai_literacy: number;
    // 4つは互いに排他で合算するとセッション内の全カバレッジ件数になる
    reached_count: number;         // stuck_type IS NULL かつ level_reached >= 2
    stuck_count: number;           // stuck_type IN ('shallow','single_option','rigid')
    not_experienced_count: number; // stuck_type = 'not_experienced'
    undeveloped_count: number;     // stuck_type IS NULL かつ level_reached <= 1
  };
  patterns: Array<{
    pattern_id: string;
    pattern_code: string;            // 例: 'D-03'
    pattern_title: string;
    category: PatternCategory;
    level_reached: 0 | 1 | 2 | 3 | 4;
    stuck_type: StuckType | null;
    scores: {
      authenticity: number;
      judgment: number;
      scope: number;
      meta_cognition: number;
      ai_literacy: number;
    };
    notes: string;
    turn_count: number;
  }>;
}

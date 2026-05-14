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
}

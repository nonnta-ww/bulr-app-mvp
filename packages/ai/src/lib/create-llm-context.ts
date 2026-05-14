import type { LlmAnalysis, LlmEvaluation, HeatmapData } from '@bulr/types/evaluation';
import type { InterviewTurn, AssessmentPattern, PatternCoverage } from '@bulr/db/schema';

// Requirement 7.7, 8.8: Context bound to sessionId and userId at creation time
export interface LlmContext {
  sessionId: string;
  userId: string;
}

// --- Input types for each LLM method ---

export interface AnalyzeTurnInput {
  transcript: string;
  currentPattern?: {
    id: string;
    code: string;
    title: string;
    description: string;
  };
  history: Array<{ question: string; answer: string }>;
}

export interface SplitInterviewerCandidateInput {
  transcript: string;
  questionTextHint?: string | null;
}

export interface ProposeNextQuestionsInput {
  sessionState: {
    turnCount: number;
    elapsedMinutes: number;
  };
  plannedPatterns: Array<{
    code: string;
    title: string;
    category: string;
  }>;
  completed: Array<{
    pattern_code: string;
    level_reached: number;
    stuck_type?: string | null;
  }>;
}

export interface AggregatePatternCoverageInput {
  turns: InterviewTurn[];
  pattern: AssessmentPattern;
}

export interface GenerateSessionReportInput {
  allCoverage: PatternCoverage[];
  freeQuestions: InterviewTurn[];
}

// --- Output types ---

export interface SplitResult {
  interviewer_text: string;
  candidate_text: string;
}

export interface ProposeNextQuestionsResult {
  candidates: Array<{
    text: string;
    intent: 'deep_dive' | 'meta_cognition' | 'next_pattern';
  }>;
}

export interface GenerateSessionReportResult {
  heatmap_data: HeatmapData;
  summary_text: string;
  generated_at: string;
}

// --- Return interface for createLlmContext ---

export interface LlmContextMethods {
  /**
   * Analyzes a single interview turn against the current assessment pattern.
   * Internally uses ctx.sessionId — never trusts LLM-provided sessionId.
   */
  analyzeTurn(input: AnalyzeTurnInput): Promise<LlmAnalysis>;

  /**
   * Splits a raw transcript into interviewer and candidate segments.
   * Internally uses ctx.sessionId — never trusts LLM-provided sessionId.
   */
  splitInterviewerCandidate(input: SplitInterviewerCandidateInput): Promise<SplitResult>;

  /**
   * Proposes next interview questions based on session state and pattern progress.
   * Internally uses ctx.sessionId — never trusts LLM-provided sessionId.
   */
  proposeNextQuestions(input: ProposeNextQuestionsInput): Promise<ProposeNextQuestionsResult>;

  /**
   * Aggregates LLM evaluation scores across all turns for a given pattern.
   * Internally uses ctx.sessionId — never trusts LLM-provided sessionId.
   */
  aggregatePatternCoverage(input: AggregatePatternCoverageInput): Promise<LlmEvaluation>;

  /**
   * Generates the final session report including heatmap and summary.
   * Internally uses ctx.sessionId — never trusts LLM-provided sessionId.
   */
  generateSessionReport(input: GenerateSessionReportInput): Promise<GenerateSessionReportResult>;
}

/**
 * Requirement 7.7, 8.8: Factory that binds sessionId and userId into a closure.
 * All 5 LLM methods use ctx.sessionId / ctx.userId internally.
 * Even if LLM output contains a different sessionId, the bound ctx values are used exclusively
 * (hallucination defense).
 *
 * @param ctx - The LLM context containing sessionId and userId to bind.
 * @returns An object exposing all 5 LLM methods with ctx pre-bound.
 */
export function createLlmContext(ctx: LlmContext): LlmContextMethods {
  // ctx.sessionId and ctx.userId are captured in the closure and cannot be overridden
  // by any value passed through method inputs or LLM outputs.
  const { sessionId, userId } = ctx;

  return {
    analyzeTurn(_input: AnalyzeTurnInput): Promise<LlmAnalysis> {
      // sessionId and userId are bound via closure (hallucination defense)
      void sessionId;
      void userId;
      // Implementation will be completed in G3.4
      throw new Error('not yet implemented: analyzeTurn (G3.4)');
    },

    splitInterviewerCandidate(_input: SplitInterviewerCandidateInput): Promise<SplitResult> {
      // sessionId and userId are bound via closure (hallucination defense)
      void sessionId;
      void userId;
      // Implementation will be completed in G3.5
      throw new Error('not yet implemented: splitInterviewerCandidate (G3.5)');
    },

    proposeNextQuestions(_input: ProposeNextQuestionsInput): Promise<ProposeNextQuestionsResult> {
      // sessionId and userId are bound via closure (hallucination defense)
      void sessionId;
      void userId;
      // Implementation will be completed in G3.6
      throw new Error('not yet implemented: proposeNextQuestions (G3.6)');
    },

    aggregatePatternCoverage(_input: AggregatePatternCoverageInput): Promise<LlmEvaluation> {
      // sessionId and userId are bound via closure (hallucination defense)
      void sessionId;
      void userId;
      // Implementation will be completed in G3.7
      throw new Error('not yet implemented: aggregatePatternCoverage (G3.7)');
    },

    generateSessionReport(_input: GenerateSessionReportInput): Promise<GenerateSessionReportResult> {
      // sessionId and userId are bound via closure (hallucination defense)
      void sessionId;
      void userId;
      // Implementation will be completed in G3.8
      throw new Error('not yet implemented: generateSessionReport (G3.8)');
    },
  };
}

import type { LlmAnalysis, LlmEvaluation, HeatmapData } from '@bulr/types/evaluation';
import type { InterviewTurn, AssessmentPattern, PatternCoverage } from '@bulr/db/schema';
import { analyzeTurn } from '../functions/analyze-turn';
import { splitInterviewerCandidate } from '../functions/split-interviewer-candidate';
import { proposeNextQuestions } from '../functions/propose-next-questions';
import { aggregatePatternCoverage } from '../functions/aggregate-pattern-coverage';
import { generateSessionReport } from '../functions/generate-session-report';

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

  const boundCtx: LlmContext = { sessionId, userId };

  return {
    analyzeTurn(input: AnalyzeTurnInput): Promise<LlmAnalysis> {
      return analyzeTurn({ ...input, ctx: boundCtx });
    },

    splitInterviewerCandidate(input: SplitInterviewerCandidateInput): Promise<SplitResult> {
      return splitInterviewerCandidate({ ...input, ctx: boundCtx });
    },

    proposeNextQuestions(input: ProposeNextQuestionsInput): Promise<ProposeNextQuestionsResult> {
      return proposeNextQuestions({ ...input, ctx: boundCtx });
    },

    aggregatePatternCoverage(input: AggregatePatternCoverageInput): Promise<LlmEvaluation> {
      return aggregatePatternCoverage({ ...input, ctx: boundCtx });
    },

    generateSessionReport(input: GenerateSessionReportInput): Promise<GenerateSessionReportResult> {
      return generateSessionReport({ ...input, ctx: boundCtx });
    },
  };
}

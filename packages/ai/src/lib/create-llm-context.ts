import type { LlmAnalysis, LlmEvaluation, HeatmapData } from '@bulr/types/evaluation';
import type { InterviewerProfile, CandidateInfo } from '@bulr/types/profile';
import type { InterviewTurn, AssessmentPattern, PatternCoverage } from '@bulr/db/schema';
import { analyzeTurn } from '../functions/analyze-turn';
import { splitInterviewerCandidate } from '../functions/split-interviewer-candidate';
import { proposeNextQuestions } from '../functions/propose-next-questions';
import { aggregatePatternCoverage } from '../functions/aggregate-pattern-coverage';
import { generateSessionReport } from '../functions/generate-session-report';

// Requirement 7.7, 8.8: Context bound to sessionId and userId at creation time.
// Extended (Requirements 9.2, 9.4): carries InterviewerProfile / CandidateInfo /
// plannedPatterns / completedCoverage so that buildSystemPrompt can be invoked
// with concrete values from every LLM function (no dummy ctx).
export interface CompletedCoverageEntry {
  pattern_code: string;
  level_reached: 0 | 1 | 2 | 3 | 4;
  evaluation: LlmEvaluation;
}

export interface LlmContext {
  sessionId: string;
  userId: string;
  interviewerProfile: InterviewerProfile;
  candidateInfo: CandidateInfo;
  plannedPatterns: AssessmentPattern[];
  completedCoverage: CompletedCoverageEntry[];
  /**
   * Optional current target pattern. Used by buildSystemPrompt Section 12
   * to render "現在のパターン" with full assessment_pattern fields
   * (level_1_intro / level_2_focus / ... / ai_perspective / signals).
   */
  currentPattern?: AssessmentPattern;
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
    pattern_id?: string;
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
 * Requirement 7.7, 8.8: Factory that binds the full LlmContext into a closure.
 * All 5 LLM methods use the bound ctx internally — even if LLM output contains
 * a different sessionId, the bound ctx values are used exclusively
 * (hallucination defense).
 *
 * The extended ctx (Requirements 9.2, 9.4) ensures buildSystemPrompt receives
 * concrete profile / planned / completed values from every LLM function.
 *
 * @param ctx - The LLM context containing sessionId, userId, profile, planned, completed.
 * @returns An object exposing all 5 LLM methods with ctx pre-bound.
 */
export function createLlmContext(ctx: LlmContext): LlmContextMethods {
  // Capture full ctx in closure (cannot be overridden by method inputs or LLM outputs).
  const boundCtx: LlmContext = { ...ctx };

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

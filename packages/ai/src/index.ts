// packages/ai/src/index.ts — barrel for @bulr/ai
// Requirements 8.1-8.12

// LLM functions (5 standalone functions)
export { analyzeTurn, analyzeTurnOutputSchema } from './functions/analyze-turn';
export {
  splitInterviewerCandidate,
  splitOutputSchema,
} from './functions/split-interviewer-candidate';
export {
  proposeNextQuestions,
  proposeOutputSchema,
} from './functions/propose-next-questions';
export {
  aggregatePatternCoverage,
  aggregateOutputSchema,
} from './functions/aggregate-pattern-coverage';
export {
  generateSessionReport,
  reportOutputSchema,
} from './functions/generate-session-report';

// Audio transcription
export { transcribeAudio } from './whisper/transcribe';

// System prompt
export { buildSystemPrompt } from './prompts/system-prompt';
export type { SystemPromptCtx } from './prompts/system-prompt';

// LLM context factory
export { createLlmContext } from './lib/create-llm-context';
export type { LlmContext } from './lib/create-llm-context';

// Validation helpers and safe fallbacks
export {
  validateAndFallback,
  SAFE_LLM_ANALYSIS_FALLBACK,
  SAFE_LLM_EVALUATION_FALLBACK,
  SAFE_PROPOSAL_FALLBACK,
  SAFE_SESSION_REPORT_FALLBACK,
} from './lib/validate-llm-output';

// Model client
export { claudeSonnet46 } from './client';

// Deterministic aggregation
export { aggregateHeatmap } from './lib/aggregate-heatmap';

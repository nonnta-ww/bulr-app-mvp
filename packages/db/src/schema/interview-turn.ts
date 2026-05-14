import { integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import type { LlmAnalysis } from '@bulr/types/evaluation';

import { interviewSession } from './interview-session';
import { assessmentPattern } from './assessment-pattern';
import { questionProposal } from './question-proposal';

export const questionSource = pgEnum('question_source', [
  'llm_candidate_1',
  'llm_candidate_2',
  'llm_candidate_3',
  'manual',
]);

export const patternMatchConfidence = pgEnum('pattern_match_confidence', [
  'exact',
  'inferred_high',
  'inferred_low',
  'off_pattern',
]);

type TranscriptData = { interviewer?: string; candidate: string; raw: string };

export const interviewTurn = pgTable('interview_turn', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  session_id: text('session_id')
    .notNull()
    .references(() => interviewSession.id),
  sequence_no: integer('sequence_no').notNull(),
  pattern_id: text('pattern_id').references(() => assessmentPattern.id),
  proposal_id: text('proposal_id').references(() => questionProposal.id),
  question_source: questionSource('question_source').notNull(),
  question_text: text('question_text').notNull(),
  audio_key: text('audio_key'),
  audio_expires_at: timestamp('audio_expires_at', { withTimezone: true }),
  transcript: jsonb('transcript').$type<TranscriptData>().notNull(),
  llm_analysis: jsonb('llm_analysis').$type<LlmAnalysis>().notNull(),
  pattern_match_confidence: patternMatchConfidence('pattern_match_confidence').notNull(),
  off_pattern_summary: text('off_pattern_summary'),
  duration_ms: integer('duration_ms').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InterviewTurn = typeof interviewTurn.$inferSelect;
export type NewInterviewTurn = typeof interviewTurn.$inferInsert;

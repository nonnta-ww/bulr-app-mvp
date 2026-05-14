import { pgEnum, pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { interviewSession } from './interview-session';

export const questionIntent = pgEnum('question_intent', [
  'deep_dive',
  'meta_cognition',
  'next_pattern',
]);

export const questionProposal = pgTable('question_proposal', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  session_id: text('session_id')
    .notNull()
    .references(() => interviewSession.id),
  prepared_for_turn_no: integer('prepared_for_turn_no').notNull(),
  candidate_1_text: text('candidate_1_text').notNull(),
  candidate_1_intent: questionIntent('candidate_1_intent').notNull(),
  candidate_2_text: text('candidate_2_text').notNull(),
  candidate_2_intent: questionIntent('candidate_2_intent').notNull(),
  candidate_3_text: text('candidate_3_text').notNull(),
  candidate_3_intent: questionIntent('candidate_3_intent').notNull(),
  selected_index: integer('selected_index'),
  generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type QuestionProposal = typeof questionProposal.$inferSelect;
export type NewQuestionProposal = typeof questionProposal.$inferInsert;

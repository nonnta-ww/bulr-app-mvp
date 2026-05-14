import { pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { candidate } from './candidate';
import { user } from './auth';

export const sessionStatus = pgEnum('interview_session_status', [
  'draft',
  'in_progress',
  'completed',
  'abandoned',
]);

export const interviewSession = pgTable('interview_session', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  interviewer_id: text('interviewer_id')
    .notNull()
    .references(() => user.id),
  candidate_id: text('candidate_id')
    .notNull()
    .references(() => candidate.id),
  status: sessionStatus('status').notNull().default('draft'),
  role: text('role').notNull().default('backend'),
  planned_pattern_codes: text('planned_pattern_codes').array().notNull(),
  consent_obtained_at: timestamp('consent_obtained_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  consent_version: text('consent_version').notNull().default('ja-v1'),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InterviewSession = typeof interviewSession.$inferSelect;
export type NewInterviewSession = typeof interviewSession.$inferInsert;

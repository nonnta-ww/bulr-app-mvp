import { pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { candidate } from './candidate';
import { user } from './auth';
import { entry } from './entry';

export const sessionStatus = pgEnum('interview_session_status', [
  'draft',
  'in_progress',
  'completed',
  'abandoned',
]);

export const captureProvider = pgEnum('capture_provider', ['recall', 'mic']);

export const consentMethod = pgEnum('consent_method', ['interviewer_attestation']);

export const captureStatus = pgEnum('capture_status', [
  'idle',
  'bot_joining',
  'recording',
  'paused',
  'stopping',
  'stopped',
  'failed',
  'aborted',
]);

export const interviewSession = pgTable(
  'interview_session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    interviewer_id: text('interviewer_id')
      .notNull()
      .references(() => user.id),
    candidate_id: text('candidate_id').references(() => candidate.id),
    status: sessionStatus('status').notNull().default('draft'),
    role: text('role').notNull().default('backend'),
    planned_pattern_codes: text('planned_pattern_codes').array().notNull(),
    // 導入前は defaultNow() で全セッションが自動同意扱いになっていた（ゲートが vacuous）。
    // interview-consent-gate spec（migration 0023）で nullable 化・default 撤去し、
    // 面接官アテステーションによる明示 recordConsent のみが値を set する。
    consent_obtained_at: timestamp('consent_obtained_at', { withTimezone: true }),
    consent_version: text('consent_version').notNull().default('ja-v1'),
    // interview-consent-gate spec（migration 0023）で追加。将来の候補者セルフ同意（案B）を
    // enum 値追加のみで載せられるよう consent_actor_id は主体多型を許容し FK を張らない。
    consent_method: consentMethod('consent_method'),
    consent_actor_id: text('consent_actor_id'),
    started_at: timestamp('started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    entry_id: text('entry_id').references(() => entry.id),
    // capture columns (added by realtime-interview-capture spec, migration 0015)
    capture_provider: captureProvider('capture_provider'),
    capture_status: captureStatus('capture_status').notNull().default('idle'),
    bot_id: text('bot_id'),
    meeting_url: text('meeting_url'),
    last_capture_event_at: timestamp('last_capture_event_at', { withTimezone: true }),
    analysis_capped_at: timestamp('analysis_capped_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('interview_session_bot_id_unique').on(t.bot_id)],
);

export type InterviewSession = typeof interviewSession.$inferSelect;
export type NewInterviewSession = typeof interviewSession.$inferInsert;

import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { interviewSession } from './interview-session';

export const captureRecordingKind = pgEnum('capture_recording_kind', [
  'mic_chunk',
  'bot_full',
]);

export const captureRecording = pgTable('capture_recording', {
  id: uuid('id').primaryKey().defaultRandom(),
  session_id: text('session_id')
    .notNull()
    .references(() => interviewSession.id),
  kind: captureRecordingKind('kind').notNull(),
  chunk_no: integer('chunk_no'),
  audio_key: text('audio_key'),
  audio_expires_at: timestamp('audio_expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CaptureRecording = typeof captureRecording.$inferSelect;
export type NewCaptureRecording = typeof captureRecording.$inferInsert;

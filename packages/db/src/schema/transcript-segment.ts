import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { interviewSession } from './interview-session';
import { interviewTurn } from './interview-turn';

export const speakerRole = pgEnum('speaker_role', [
  'interviewer',
  'candidate',
  'unknown',
]);

export const segmentOrigin = pgEnum('segment_origin', [
  'bot_realtime',
  'mic_chunk',
  'post_batch',
]);

export const transcriptSegment = pgTable(
  'transcript_segment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    session_id: text('session_id')
      .notNull()
      .references(() => interviewSession.id),
    seq: integer('seq').notNull(),
    source_id: text('source_id').notNull(),
    speaker_role: speakerRole('speaker_role').notNull(),
    speaker_label: text('speaker_label'),
    text: text('text').notNull(),
    started_at_ms: integer('started_at_ms').notNull(),
    ended_at_ms: integer('ended_at_ms').notNull(),
    origin: segmentOrigin('origin').notNull(),
    logical_turn_id: text('logical_turn_id').references(() => interviewTurn.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transcript_segment_session_seq_unique').on(t.session_id, t.seq),
    uniqueIndex('transcript_segment_session_source_unique').on(t.session_id, t.source_id),
    index('transcript_segment_session_id_idx').on(t.session_id),
  ],
);

export type TranscriptSegment = typeof transcriptSegment.$inferSelect;
export type NewTranscriptSegment = typeof transcriptSegment.$inferInsert;

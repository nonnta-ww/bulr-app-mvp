import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import type { HeatmapData } from '@bulr/types/evaluation';

import { interviewSession } from './interview-session';

export const sessionReport = pgTable('session_report', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  session_id: text('session_id')
    .notNull()
    .unique()
    .references(() => interviewSession.id),
  heatmap_data: jsonb('heatmap_data').$type<HeatmapData>().notNull(),
  summary_text: text('summary_text').notNull(),
  generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SessionReport = typeof sessionReport.$inferSelect;
export type NewSessionReport = typeof sessionReport.$inferInsert;

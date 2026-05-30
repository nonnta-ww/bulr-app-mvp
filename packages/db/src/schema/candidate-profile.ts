/**
 * candidate_profile テーブル定義
 *
 * 求職者（候補者）プロファイル。Better Auth が管理する `user` テーブルと 1:1 で対応し、
 * 求職者固有の属性を格納する。
 */

import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { user } from './auth';

export const candidateProfile = pgTable('candidate_profile', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  headline: text('headline'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CandidateProfile = typeof candidateProfile.$inferSelect;
export type NewCandidateProfile = typeof candidateProfile.$inferInsert;

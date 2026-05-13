/**
 * rate_limit テーブル定義
 *
 * key prefix の用途:
 *   'email:<email>'   — Magic Link メールレート制限（authentication spec）
 *   'ip:<ip>'         — Magic Link IP レート制限（authentication spec）
 *   'session:<id>'    — 将来予約
 *   'chat:<userId>'   — assessment-engine spec で再利用予定
 */

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const rateLimit = pgTable('rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start').notNull().defaultNow(),
});

export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;

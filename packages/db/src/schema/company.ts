/**
 * company テーブル定義
 *
 * 企業（求人を掲載する組織）を表すマスタテーブル。
 * opening テーブルや user_profile から参照される。
 */

import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const company = pgTable('company', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof company.$inferSelect;
export type NewCompany = typeof company.$inferInsert;

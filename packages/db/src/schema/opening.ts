/**
 * opening テーブル定義
 *
 * 企業が公開する求人票（ポジション）。company に紐づき、
 * status によって draft / open / closed のライフサイクルを管理する。
 * invitation テーブルから参照される。
 */

import { pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { company } from './company';

export const openingStatus = pgEnum('opening_status', ['draft', 'open', 'closed']);

export const opening = pgTable('opening', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  companyId: text('company_id')
    .notNull()
    .references(() => company.id),
  title: text('title').notNull(),
  description: text('description'),
  status: openingStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Opening = typeof opening.$inferSelect;
export type NewOpening = typeof opening.$inferInsert;

// OpeningStatus は pgEnum から派生（DRY 原則: enum 値の単一の真実を pgEnum 側に置く）
// packages/db のバレルで再 export し、後続 spec は `import type { OpeningStatus } from '@bulr/db'` する
export type OpeningStatus = (typeof openingStatus.enumValues)[number];

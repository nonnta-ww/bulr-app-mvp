/**
 * invitation テーブル定義
 *
 * 候補者を特定の求人（opening）に招待するためのトークンレコード。
 * token はユニーク制約を持ち、entry-flow が consumed_at を更新することで
 * 使用済み状態を管理する（seam）。
 */

import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { opening } from './opening';

export const invitation = pgTable('invitation', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  openingId: text('opening_id')
    .notNull()
    .references(() => opening.id),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;

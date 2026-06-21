/**
 * company_user_invitation テーブル定義
 *
 * 企業ユーザー（面接官）を会社に紐付けるための招待トークンレコードを管理する。
 * 管理者（admin）が発行し、招待された企業ユーザーが受諾することで
 * user_profile.company_id および role_in_org が設定される。
 *
 * このテーブルは候補者×募集向けの既存 invitation テーブルとは別概念であり、
 * 会社ユーザー招待専用のデータ構造として分離している（Req 6.5）。
 */

import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { company } from './company';
import { user } from './auth';

export type CompanyUserInvitationStatus = 'pending' | 'accepted' | 'revoked';

export const companyUserInvitation = pgTable(
  'company_user_invitation',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id),
    email: text('email').notNull(),
    roleInOrg: text('role_in_org').notNull(),
    token: text('token').notNull().unique(),
    status: text('status').notNull().default('pending'),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: text('accepted_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('company_user_invitation_company_email_pending_uniq')
      .on(table.companyId, table.email)
      .where(sql`status = 'pending'`),
  ],
);

export type CompanyUserInvitation = typeof companyUserInvitation.$inferSelect;
export type NewCompanyUserInvitation = typeof companyUserInvitation.$inferInsert;

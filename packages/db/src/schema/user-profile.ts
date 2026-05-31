/**
 * user_profile テーブル定義
 *
 * v1 では受験者プロファイルだったが、v2 では面接官プロファイル（Better Auth user と 1:1）を保持する。
 * Better Auth が管理する `user` テーブルと 1:1 で対応し、面接官固有の属性を格納する。
 * databaseHooks.user.create.after で自動生成される。
 */

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { company } from './company';

export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  companyId: text('company_id').references(() => company.id),
  displayName: text('display_name').notNull(),
  roleInOrg: text('role_in_org'),
  yearsOfExperience: integer('years_of_experience'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;

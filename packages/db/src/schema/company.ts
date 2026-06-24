/**
 * company テーブル定義
 *
 * 企業（求人を掲載する組織）を表すマスタテーブル。
 * opening テーブルや user_profile から参照される。
 */

import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

/**
 * 会社のライフサイクルステータス型（Req 4.1）。
 *
 * ランタイムの Zod enum は packages/auth の companyStatusSchema（task 1.3）が持つ。
 * ここでは Drizzle スキーマおよびクエリ記述の利便のために TypeScript 文字列リテラル
 * ユニオン型のみを定義する。
 */
export type CompanyStatus = 'active' | 'suspended' | 'terminated';

export const company = pgTable('company', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  /**
   * 会社のライフサイクルステータス（authoritative 列）。Req 4.1, 4.6。
   *
   * 値: 'active'（有効） | 'suspended'（一時停止） | 'terminated'（解約）。
   * 新規行はすべて 'active' で作成される。
   *
   * terminated は終端状態であり、将来のデータ削除請求対応（Req 4.6）において
   * 削除対象を識別するためのマーカーとして機能する（実際の削除は別 spec）。
   *
   * is_active は後方互換シャドウ列（非推奨）。company-status 系アクション（task 3.4）が
   * status と is_active を常に同期して更新する。新規の読み手はこの status 列を参照すること。
   */
  status: text('status').notNull().default('active'),
  /** @deprecated 後方互換シャドウ。status 列が authoritative。task 3.4 で同期維持される。 */
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof company.$inferSelect;
export type NewCompany = typeof company.$inferInsert;

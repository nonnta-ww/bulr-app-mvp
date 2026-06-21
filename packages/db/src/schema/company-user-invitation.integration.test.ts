/**
 * company-user-invitation スキーマの形状検証テスト
 *
 * このテストは実 DB 接続を必要とせず、Drizzle テーブル定義オブジェクトの
 * 構造（テーブル名・カラム名・notNull・default・インデックス定義）のみを検証する。
 * getTableConfig / getTableColumns を使い、Drizzle 内部の Symbol に直接触れない。
 */

import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  companyUserInvitation,
  type CompanyUserInvitation,
  type NewCompanyUserInvitation,
  type CompanyUserInvitationStatus,
} from './company-user-invitation';

describe('companyUserInvitation テーブル定義', () => {
  const config = getTableConfig(companyUserInvitation);
  const columns = getTableColumns(companyUserInvitation);

  it('テーブル名が company_user_invitation であること', () => {
    expect(config.name).toBe('company_user_invitation');
  });

  describe('カラム構造', () => {
    it('id カラムが存在し PK であること', () => {
      expect(columns).toHaveProperty('id');
      expect(columns.id.primary).toBe(true);
    });

    it('companyId カラムが存在し notNull であること', () => {
      expect(columns).toHaveProperty('companyId');
      expect(columns.companyId.notNull).toBe(true);
    });

    it('email カラムが存在し notNull であること', () => {
      expect(columns).toHaveProperty('email');
      expect(columns.email.notNull).toBe(true);
    });

    it('roleInOrg カラムが存在し notNull であること', () => {
      expect(columns).toHaveProperty('roleInOrg');
      expect(columns.roleInOrg.notNull).toBe(true);
    });

    it('token カラムが存在し notNull かつ unique であること', () => {
      expect(columns).toHaveProperty('token');
      expect(columns.token.notNull).toBe(true);
      expect(columns.token.isUnique).toBe(true);
    });

    it('status カラムが存在し notNull でデフォルト pending であること', () => {
      expect(columns).toHaveProperty('status');
      expect(columns.status.notNull).toBe(true);
      expect(columns.status.default).toBe('pending');
    });

    it('invitedByUserId カラムが存在し notNull であること', () => {
      expect(columns).toHaveProperty('invitedByUserId');
      expect(columns.invitedByUserId.notNull).toBe(true);
    });

    it('expiresAt カラムが存在し notNull であること', () => {
      expect(columns).toHaveProperty('expiresAt');
      expect(columns.expiresAt.notNull).toBe(true);
    });

    it('acceptedAt カラムが存在し nullable であること', () => {
      expect(columns).toHaveProperty('acceptedAt');
      expect(columns.acceptedAt.notNull).toBe(false);
    });

    it('acceptedByUserId カラムが存在し nullable であること', () => {
      expect(columns).toHaveProperty('acceptedByUserId');
      expect(columns.acceptedByUserId.notNull).toBe(false);
    });

    it('createdAt カラムが存在し notNull でデフォルト値を持つこと', () => {
      expect(columns).toHaveProperty('createdAt');
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.createdAt.hasDefault).toBe(true);
    });

    it('updatedAt カラムが存在し notNull でデフォルト値を持つこと', () => {
      expect(columns).toHaveProperty('updatedAt');
      expect(columns.updatedAt.notNull).toBe(true);
      expect(columns.updatedAt.hasDefault).toBe(true);
    });
  });

  describe('インデックス定義', () => {
    it('インデックスが少なくとも1件定義されていること', () => {
      expect(config.indexes.length).toBeGreaterThanOrEqual(1);
    });

    it('partial unique index が安定した名称で定義されていること', () => {
      const names = config.indexes.map((idx) => idx.config.name);
      expect(names).toContain('company_user_invitation_company_email_pending_uniq');
    });

    it('partial unique index が WHERE 句を持つこと', () => {
      const idx = config.indexes.find(
        (i) => i.config.name === 'company_user_invitation_company_email_pending_uniq',
      );
      expect(idx).toBeDefined();
      expect(idx?.config.where).toBeDefined();
    });

    it('partial unique index が unique であること', () => {
      const idx = config.indexes.find(
        (i) => i.config.name === 'company_user_invitation_company_email_pending_uniq',
      );
      expect(idx?.config.unique).toBe(true);
    });
  });

  describe('型の整合性（コンパイル時検証）', () => {
    it('$inferSelect の型として CompanyUserInvitation が使えること', () => {
      // 型エラーにならなければ OK（実行時には常に true）
      type Check = CompanyUserInvitation extends { id: string } ? true : false;
      const result: Check = true;
      expect(result).toBe(true);
    });

    it('$inferInsert の型として NewCompanyUserInvitation が使えること', () => {
      type Check = NewCompanyUserInvitation extends { email: string } ? true : false;
      const result: Check = true;
      expect(result).toBe(true);
    });

    it('CompanyUserInvitationStatus が想定する union 型の全値を持つこと', () => {
      const statuses: CompanyUserInvitationStatus[] = ['pending', 'accepted', 'revoked'];
      expect(statuses).toHaveLength(3);
    });
  });
});

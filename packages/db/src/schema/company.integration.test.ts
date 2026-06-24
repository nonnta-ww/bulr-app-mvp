/**
 * company スキーマの形状検証テスト
 *
 * このテストは実 DB 接続を必要とせず、Drizzle テーブル定義オブジェクトの
 * 構造（テーブル名・カラム名・notNull・default）のみを検証する。
 * getTableConfig / getTableColumns を使い、Drizzle 内部の Symbol に直接触れない。
 */

import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { company, type Company, type NewCompany, type CompanyStatus } from './company';

describe('company テーブル定義', () => {
  const config = getTableConfig(company);
  const columns = getTableColumns(company);

  it('テーブル名が company であること', () => {
    expect(config.name).toBe('company');
  });

  describe('既存カラム（後方互換）', () => {
    it('id カラムが存在し PK であること', () => {
      expect(columns).toHaveProperty('id');
      expect(columns.id.primary).toBe(true);
    });

    it('name カラムが存在し notNull であること', () => {
      expect(columns).toHaveProperty('name');
      expect(columns.name.notNull).toBe(true);
    });

    it('isActive カラムが存在し notNull でデフォルト true であること（後方互換シャドウ）', () => {
      expect(columns).toHaveProperty('isActive');
      expect(columns.isActive.notNull).toBe(true);
      expect(columns.isActive.default).toBe(true);
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

  describe('ライフサイクルステータス列（Req 4.1, 4.6）', () => {
    it('status カラムが存在すること', () => {
      expect(columns).toHaveProperty('status');
    });

    it('status カラムが notNull であること', () => {
      expect(columns.status.notNull).toBe(true);
    });

    it('status カラムのデフォルト値が active であること', () => {
      expect(columns.status.default).toBe('active');
    });
  });

  describe('型の整合性（コンパイル時検証）', () => {
    it('$inferSelect の型として Company が使えること', () => {
      type Check = Company extends { id: string } ? true : false;
      const result: Check = true;
      expect(result).toBe(true);
    });

    it('$inferInsert の型として NewCompany が使えること', () => {
      type Check = NewCompany extends { name: string } ? true : false;
      const result: Check = true;
      expect(result).toBe(true);
    });

    it('CompanyStatus が想定する union 型の全値を持つこと', () => {
      const statuses: CompanyStatus[] = ['active', 'suspended', 'terminated'];
      expect(statuses).toHaveLength(3);
    });
  });
});

/**
 * getCompanyDetail — 統合テスト（実 DB 接続）
 *
 * 検証内容（task 3.5 / Req 3.1）:
 *  1. company.status が CompanyDetail.company に含まれること。
 *  2. pendingInvitations に pending ステータスの招待のみ返され、
 *     accepted / revoked の招待は含まれないこと。
 *  3. 各 pendingInvitation 行が正しいフィールド構造を持つこと。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 * スキーマは drizzle migrator で自己適用する。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { DB } from '../../client';
import { user } from '../../schema/auth';
import { company } from '../../schema/company';
import { companyUserInvitation } from '../../schema/company-user-invitation';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[companies-query.integration] DATABASE_URL 未設定のためスキップします。');
}

let db: DB;
let getCompanyDetail: typeof import('./companies-query')['getCompanyDetail'];

// フィクスチャ後始末用 ID
const created: {
  companyId?: string;
  adminUserId?: string;
  invitationIds: string[];
} = { invitationIds: [] };

describeDb('getCompanyDetail 統合テスト', () => {
  beforeAll(async () => {
    // DATABASE_URL を要求するモジュールを動的 import
    const clientMod = await import('../../client');
    db = clientMod.db;
    const queryMod = await import('./companies-query');
    getCompanyDetail = queryMod.getCompanyDetail;

    // スキーマを migrator で自己適用（適用済みなら no-op）
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // --- フィクスチャ投入 ---

    // 管理者ユーザー（invitation の invited_by_user_id に必要）
    const adminUserId = `test-admin-${randomUUID()}`;
    created.adminUserId = adminUserId;
    await db.insert(user).values({
      id: adminUserId,
      email: `admin-${adminUserId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // テスト対象会社（status = 'active'）
    const [insertedCompany] = await db
      .insert(company)
      .values({ name: `テスト会社_${randomUUID()}`, status: 'active', isActive: true })
      .returning({ id: company.id });
    created.companyId = insertedCompany!.id;

    const companyId = insertedCompany!.id;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // pending 招待 x2
    const [inv1] = await db
      .insert(companyUserInvitation)
      .values({
        companyId,
        email: `pending1@example.com`,
        roleInOrg: 'member',
        token: `tok-pending1-${randomUUID()}`,
        status: 'pending',
        invitedByUserId: adminUserId,
        expiresAt,
      })
      .returning({ id: companyUserInvitation.id });

    const [inv2] = await db
      .insert(companyUserInvitation)
      .values({
        companyId,
        email: `pending2@example.com`,
        roleInOrg: 'admin',
        token: `tok-pending2-${randomUUID()}`,
        status: 'pending',
        invitedByUserId: adminUserId,
        expiresAt,
      })
      .returning({ id: companyUserInvitation.id });

    // accepted 招待（結果に含まれてはならない）
    const [inv3] = await db
      .insert(companyUserInvitation)
      .values({
        companyId,
        email: `accepted@example.com`,
        roleInOrg: 'member',
        token: `tok-accepted-${randomUUID()}`,
        status: 'accepted',
        invitedByUserId: adminUserId,
        expiresAt,
      })
      .returning({ id: companyUserInvitation.id });

    // revoked 招待（結果に含まれてはならない）
    const [inv4] = await db
      .insert(companyUserInvitation)
      .values({
        companyId,
        email: `revoked@example.com`,
        roleInOrg: 'member',
        token: `tok-revoked-${randomUUID()}`,
        status: 'revoked',
        invitedByUserId: adminUserId,
        expiresAt,
      })
      .returning({ id: companyUserInvitation.id });

    created.invitationIds.push(inv1!.id, inv2!.id, inv3!.id, inv4!.id);
  });

  afterAll(async () => {
    if (!db) return;
    // 招待→会社→ユーザーの順で削除（FK 制約）
    for (const invId of created.invitationIds) {
      await db.delete(companyUserInvitation).where(eq(companyUserInvitation.id, invId));
    }
    if (created.companyId) {
      await db.delete(company).where(eq(company.id, created.companyId));
    }
    if (created.adminUserId) {
      await db.delete(user).where(eq(user.id, created.adminUserId));
    }
  });

  it('getCompanyDetail が undefined を返さないこと', async () => {
    const result = await getCompanyDetail(created.companyId!);
    expect(result).toBeDefined();
  });

  it('company.status が返ること（Req 3.1）', async () => {
    const result = await getCompanyDetail(created.companyId!);
    expect(result!.company.status).toBe('active');
  });

  it('pendingInvitations フィールドが存在すること（Req 3.1）', async () => {
    const result = await getCompanyDetail(created.companyId!);
    expect(result!.pendingInvitations).toBeDefined();
    expect(Array.isArray(result!.pendingInvitations)).toBe(true);
  });

  it('pendingInvitations が pending ステータスの招待のみを含むこと（Req 3.1）', async () => {
    const result = await getCompanyDetail(created.companyId!);
    const pendingInvs = result!.pendingInvitations;

    // accepted と revoked は除外される
    expect(pendingInvs).toHaveLength(2);
    expect(pendingInvs.every((inv) => inv.status === 'pending')).toBe(true);
  });

  it('pendingInvitations の各アイテムが正しいフィールド構造を持つこと（Req 3.1）', async () => {
    const result = await getCompanyDetail(created.companyId!);
    const pendingInvs = result!.pendingInvitations;

    for (const inv of pendingInvs) {
      expect(typeof inv.id).toBe('string');
      expect(typeof inv.email).toBe('string');
      expect(typeof inv.roleInOrg).toBe('string');
      expect(typeof inv.status).toBe('string');
      expect(inv.expiresAt).toBeInstanceOf(Date);
      expect(inv.createdAt).toBeInstanceOf(Date);
    }
  });

  it('pendingInvitations のメールアドレスが pending1 と pending2 であること', async () => {
    const result = await getCompanyDetail(created.companyId!);
    const emails = result!.pendingInvitations.map((inv) => inv.email).sort();
    expect(emails).toEqual(['pending1@example.com', 'pending2@example.com']);
  });

  it('pendingInvitations が createdAt 降順で返ること（Req 3.1）', async () => {
    const result = await getCompanyDetail(created.companyId!);
    const invs = result!.pendingInvitations;
    if (invs.length >= 2) {
      // 降順: 最初の要素 >= 次の要素
      expect(invs[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(invs[1]!.createdAt.getTime());
    }
  });

  it('既存の interviewers フィールドが引き続き返ること（後方互換）', async () => {
    const result = await getCompanyDetail(created.companyId!);
    expect(result!.interviewers).toBeDefined();
    expect(Array.isArray(result!.interviewers)).toBe(true);
  });
});

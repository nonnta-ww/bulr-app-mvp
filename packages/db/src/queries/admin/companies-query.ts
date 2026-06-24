import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '../../client';
import { user } from '../../schema/auth';
import { company } from '../../schema/company';
import type { CompanyStatus } from '../../schema/company';
import { companyUserInvitation } from '../../schema/company-user-invitation';
import { opening } from '../../schema/opening';
import { userProfile } from '../../schema/user-profile';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export interface CompanyListItem {
  id: string;
  name: string;
  isActive: boolean;
  openingCount: number;
  createdAt: Date;
}

export interface CompanyDetail {
  company: { id: string; name: string; isActive: boolean; status: CompanyStatus; createdAt: Date };
  openings: Array<{ id: string; title: string; status: string; createdAt: Date }>;
  interviewers: Array<{
    userId: string;
    email: string;
    displayName: string;
    roleInOrg: string | null;
  }>;
  pendingInvitations: Array<{
    id: string;
    email: string;
    roleInOrg: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }>;
}

// ---------------------------------------------------------------------------
// getCompaniesForAdmin
// ---------------------------------------------------------------------------

/**
 * 管理者向け企業一覧クエリ。
 *
 * - search: company.name の部分一致フィルタ（ILIKE）
 * - isActive: is_active フィルタ（undefined の場合は全件）
 * - page / pageSize: ページング（LIMIT/OFFSET）
 *
 * openingCount は company に紐づく opening の件数（全ステータス合計）。
 */
export async function getCompaniesForAdmin(params: {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}): Promise<{ items: CompanyListItem[]; total: number }> {
  const { search, isActive, page, pageSize } = params;

  // ------------------------------------------------------------------
  // WHERE 条件の構築
  // ------------------------------------------------------------------
  const conditions: SQL[] = [];

  if (search !== undefined && search.trim() !== '') {
    const pattern = `%${search.trim()}%`;
    conditions.push(ilike(company.name, pattern));
  }

  if (isActive !== undefined) {
    conditions.push(eq(company.isActive, isActive));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  // ------------------------------------------------------------------
  // openingCount: 相関サブクエリ（NULL-safe: COALESCE により 0 を保証）
  // ------------------------------------------------------------------
  const openingCountSql = sql<number>`COALESCE((
    SELECT COUNT(*)
    FROM opening o
    WHERE o.company_id = ${company.id}
  ), 0)`;

  // ------------------------------------------------------------------
  // データ取得クエリ
  // ------------------------------------------------------------------
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      id: company.id,
      name: company.name,
      isActive: company.isActive,
      openingCount: openingCountSql,
      createdAt: company.createdAt,
    })
    .from(company)
    .where(whereClause)
    .orderBy(company.createdAt)
    .limit(pageSize)
    .offset(offset);

  // ------------------------------------------------------------------
  // 件数クエリ（total）
  // ------------------------------------------------------------------
  const countRows = await db
    .select({ total: count() })
    .from(company)
    .where(whereClause);

  const total = Number(countRows[0]?.total ?? 0);

  // ------------------------------------------------------------------
  // 戻り値マッピング
  // ------------------------------------------------------------------
  const items: CompanyListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    openingCount: Number(row.openingCount),
    createdAt: row.createdAt,
  }));

  return { items, total };
}

// ---------------------------------------------------------------------------
// getCompanyDetail
// ---------------------------------------------------------------------------

/**
 * 企業詳細クエリ。指定 ID の企業と関連データを返す。
 * 存在しない場合は undefined を返す。
 *
 * - openings: 企業に紐づく募集一覧（createdAt 昇順）
 * - interviewers: user_profile.company_id が一致する面接官一覧
 */
export async function getCompanyDetail(
  companyId: string,
): Promise<CompanyDetail | undefined> {
  // ------------------------------------------------------------------
  // 企業基本情報
  // ------------------------------------------------------------------
  const companyRows = await db
    .select({
      id: company.id,
      name: company.name,
      isActive: company.isActive,
      status: company.status,
      createdAt: company.createdAt,
    })
    .from(company)
    .where(eq(company.id, companyId))
    .limit(1);

  const companyRow = companyRows[0];
  if (!companyRow) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // 募集一覧
  // ------------------------------------------------------------------
  const openingRows = await db
    .select({
      id: opening.id,
      title: opening.title,
      status: opening.status,
      createdAt: opening.createdAt,
    })
    .from(opening)
    .where(eq(opening.companyId, companyId))
    .orderBy(opening.createdAt);

  // ------------------------------------------------------------------
  // 所属面接官一覧（user_profile.company_id 一致 + user JOIN）
  // ------------------------------------------------------------------
  const interviewerRows = await db
    .select({
      userId: userProfile.userId,
      email: user.email,
      displayName: userProfile.displayName,
      roleInOrg: userProfile.roleInOrg,
    })
    .from(userProfile)
    .innerJoin(user, eq(userProfile.userId, user.id))
    .where(eq(userProfile.companyId, companyId))
    .orderBy(userProfile.displayName);

  // ------------------------------------------------------------------
  // 保留中招待一覧（status = 'pending', createdAt 降順）
  // ------------------------------------------------------------------
  const pendingInvitationRows = await db
    .select({
      id: companyUserInvitation.id,
      email: companyUserInvitation.email,
      roleInOrg: companyUserInvitation.roleInOrg,
      status: companyUserInvitation.status,
      expiresAt: companyUserInvitation.expiresAt,
      createdAt: companyUserInvitation.createdAt,
    })
    .from(companyUserInvitation)
    .where(
      and(
        eq(companyUserInvitation.companyId, companyId),
        eq(companyUserInvitation.status, 'pending'),
      ),
    )
    .orderBy(desc(companyUserInvitation.createdAt));

  // ------------------------------------------------------------------
  // 結果の組み立て
  // ------------------------------------------------------------------
  return {
    company: {
      id: companyRow.id,
      name: companyRow.name,
      isActive: companyRow.isActive,
      status: companyRow.status as CompanyStatus,
      createdAt: companyRow.createdAt,
    },
    openings: openingRows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
    })),
    interviewers: interviewerRows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName,
      roleInOrg: r.roleInOrg ?? null,
    })),
    pendingInvitations: pendingInvitationRows.map((r) => ({
      id: r.id,
      email: r.email,
      roleInOrg: r.roleInOrg,
      status: r.status,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    })),
  };
}

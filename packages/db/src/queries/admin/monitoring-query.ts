import { eq, sql } from 'drizzle-orm';

import { db } from '../../client';
import { user } from '../../schema/auth';
import { candidateProfile } from '../../schema/candidate-profile';
import { mockInterview } from '../../schema/mock-interview';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

/**
 * LLM コスト集計（mock_interview.metadata.llm_cost_estimate から集約）
 *
 * - totalUsd: 全セッション合計コスト（USD）
 * - totalInputTokens: 全セッション合計入力トークン数
 * - totalOutputTokens: 全セッション合計出力トークン数
 * - dailyTrend: 直近 30 日の日次コスト推移
 * - topCandidates: 候補者別コスト上位 10 名
 *
 * 注意: コストデータは mock_interview のみ。assessment-engine（interview セッション）は
 * llm_cost_estimate を持たないため、このメトリクスの対象外となる。
 */
export interface LlmCostMetrics {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** 日次トレンド（直近 30 日） */
  dailyTrend: Array<{ day: string; usd: number }>;
  /** 候補者別コスト上位 10 名 */
  topCandidates: Array<{
    candidateProfileId: string;
    displayName: string;
    totalUsd: number;
    sessionCount: number;
  }>;
}

/**
 * 候補者別クォータ使用状況（正規ウィンドウ式による当月カウント）
 *
 * monthlyLimit は mock-interview spec の仕様により固定値 3。
 * isLimitReached = usedThisMonth >= monthlyLimit。
 */
export interface CandidateQuotaUsage {
  candidateProfileId: string;
  displayName: string;
  email: string;
  usedThisMonth: number;
  monthlyLimit: number; // 固定値 3（mock-interview spec の仕様）
  lastSessionAt: Date | null;
  isLimitReached: boolean;
}

// ---------------------------------------------------------------------------
// getLlmCostMetrics
// ---------------------------------------------------------------------------

/**
 * LLM コストメトリクスを集計して返す。
 *
 * JSONB アクセス:
 *   (metadata->'llm_cost_estimate'->>'estimated_usd')::numeric
 *   (metadata->'llm_cost_estimate'->>'input_tokens')::int
 *   (metadata->'llm_cost_estimate'->>'output_tokens')::int
 *
 * WHERE: metadata IS NOT NULL AND metadata->'llm_cost_estimate' IS NOT NULL
 *
 * データなしの場合は 0 値・空配列を返す（null 回避）。
 */
export async function getLlmCostMetrics(): Promise<LlmCostMetrics> {
  // ------------------------------------------------------------------
  // 1. グローバル集計（合計 USD・トークン数）
  // ------------------------------------------------------------------
  const globalRows = await db
    .select({
      totalUsd: sql<string>`COALESCE(SUM(
        (${mockInterview.metadata}->'llm_cost_estimate'->>'estimated_usd')::numeric
      ), 0)`,
      totalInputTokens: sql<string>`COALESCE(SUM(
        (${mockInterview.metadata}->'llm_cost_estimate'->>'input_tokens')::int
      ), 0)`,
      totalOutputTokens: sql<string>`COALESCE(SUM(
        (${mockInterview.metadata}->'llm_cost_estimate'->>'output_tokens')::int
      ), 0)`,
    })
    .from(mockInterview)
    .where(
      sql`${mockInterview.metadata} IS NOT NULL
        AND ${mockInterview.metadata}->'llm_cost_estimate' IS NOT NULL`,
    );

  const global = globalRows[0];
  const totalUsd = Number(global?.totalUsd ?? 0);
  const totalInputTokens = Number(global?.totalInputTokens ?? 0);
  const totalOutputTokens = Number(global?.totalOutputTokens ?? 0);

  // ------------------------------------------------------------------
  // 2. 日次トレンド（直近 30 日）
  // ------------------------------------------------------------------
  const dailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${mockInterview.createdAt}), 'YYYY-MM-DD')`,
      usd: sql<string>`COALESCE(SUM(
        (${mockInterview.metadata}->'llm_cost_estimate'->>'estimated_usd')::numeric
      ), 0)`,
    })
    .from(mockInterview)
    .where(
      sql`${mockInterview.metadata} IS NOT NULL
        AND ${mockInterview.metadata}->'llm_cost_estimate' IS NOT NULL
        AND ${mockInterview.createdAt} >= now() - interval '30 days'`,
    )
    .groupBy(sql`date_trunc('day', ${mockInterview.createdAt})`)
    .orderBy(sql`date_trunc('day', ${mockInterview.createdAt})`);

  const dailyTrend = dailyRows.map((row) => ({
    day: row.day,
    usd: Number(row.usd),
  }));

  // ------------------------------------------------------------------
  // 3. 候補者別コスト上位 10 名（candidate_profile JOIN で displayName 取得）
  // ------------------------------------------------------------------
  const topRows = await db
    .select({
      candidateProfileId: mockInterview.candidateProfileId,
      displayName: candidateProfile.displayName,
      totalUsd: sql<string>`COALESCE(SUM(
        (${mockInterview.metadata}->'llm_cost_estimate'->>'estimated_usd')::numeric
      ), 0)`,
      sessionCount: sql<string>`COUNT(${mockInterview.id})`,
    })
    .from(mockInterview)
    .innerJoin(
      candidateProfile,
      eq(mockInterview.candidateProfileId, candidateProfile.id),
    )
    .where(
      sql`${mockInterview.metadata} IS NOT NULL
        AND ${mockInterview.metadata}->'llm_cost_estimate' IS NOT NULL`,
    )
    .groupBy(mockInterview.candidateProfileId, candidateProfile.displayName)
    .orderBy(
      sql`SUM((${mockInterview.metadata}->'llm_cost_estimate'->>'estimated_usd')::numeric) DESC`,
    )
    .limit(10);

  const topCandidates = topRows.map((row) => ({
    candidateProfileId: row.candidateProfileId,
    displayName: row.displayName,
    totalUsd: Number(row.totalUsd),
    sessionCount: Number(row.sessionCount),
  }));

  return {
    totalUsd,
    totalInputTokens,
    totalOutputTokens,
    dailyTrend,
    topCandidates,
  };
}

// ---------------------------------------------------------------------------
// getCandidateQuotaUsage
// ---------------------------------------------------------------------------

/**
 * 全候補者の当月クォータ使用状況を返す。
 *
 * 正規ウィンドウ式（mock-interview と共有）:
 *   GREATEST(
 *     date_trunc('month', now()),
 *     COALESCE(quota_reset_at, date_trunc('month', now()))
 *   )
 *
 * - quota_reset_at が NULL の場合も月初が基準となり、NULL 返却を回避する
 * - isLimitReached: usedThisMonth >= 3
 * - 結果は usedThisMonth DESC 順で返す
 */
export async function getCandidateQuotaUsage(): Promise<CandidateQuotaUsage[]> {
  const MONTHLY_LIMIT = 3;

  // ------------------------------------------------------------------
  // クォータウィンドウ式（正規ウィンドウ、mock-interview と共有）
  // ------------------------------------------------------------------
  const quotaWindowStart = sql`GREATEST(
    date_trunc('month', now()),
    COALESCE(${candidateProfile.quotaResetAt}, date_trunc('month', now()))
  )`;

  // ------------------------------------------------------------------
  // 当月件数: COUNT FILTER で対象ウィンドウ内のセッションのみカウント
  // ------------------------------------------------------------------
  const usedThisMonthSql = sql<string>`COALESCE(
    COUNT(${mockInterview.id}) FILTER (
      WHERE ${mockInterview.createdAt} >= ${quotaWindowStart}
    ),
    0
  )`;

  const rows = await db
    .select({
      candidateProfileId: candidateProfile.id,
      displayName: candidateProfile.displayName,
      email: user.email,
      usedThisMonth: usedThisMonthSql,
      lastSessionAt: sql<Date | null>`MAX(${mockInterview.createdAt})`,
    })
    .from(candidateProfile)
    .innerJoin(user, eq(candidateProfile.userId, user.id))
    .leftJoin(mockInterview, eq(mockInterview.candidateProfileId, candidateProfile.id))
    .where(eq(candidateProfile.isActive, true))
    .groupBy(
      candidateProfile.id,
      candidateProfile.displayName,
      candidateProfile.quotaResetAt,
      user.email,
    )
    .orderBy(
      sql`COALESCE(
        COUNT(${mockInterview.id}) FILTER (
          WHERE ${mockInterview.createdAt} >= GREATEST(
            date_trunc('month', now()),
            COALESCE(${candidateProfile.quotaResetAt}, date_trunc('month', now()))
          )
        ),
        0
      ) DESC`,
    );

  return rows.map((row) => {
    const usedThisMonth = Number(row.usedThisMonth);
    return {
      candidateProfileId: row.candidateProfileId,
      displayName: row.displayName,
      email: row.email,
      usedThisMonth,
      monthlyLimit: MONTHLY_LIMIT,
      lastSessionAt: row.lastSessionAt ?? null,
      isLimitReached: usedThisMonth >= MONTHLY_LIMIT,
    };
  });
}

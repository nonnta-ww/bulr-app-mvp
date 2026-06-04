import { eq, sql } from 'drizzle-orm';

import { db } from '../../client';
import { user } from '../../schema/auth';
import { candidateProfile } from '../../schema/candidate-profile';
import { mockInterview } from '../../schema/mock-interview';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * mock_interview.metadata には model フィールドが保存されていないため、
 * MVP では全 mock-interview コストをこの単一モデルに帰属させる。
 * モデルが変わった場合はここを更新すること。
 */
const MOCK_INTERVIEW_MODEL = 'Claude Sonnet 4.6';

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
 * - modelBreakdown: モデル別内訳（MVP では Claude Sonnet 4.6 の単一エントリ）
 * - featureBreakdown: 機能別内訳（MVP では mock-interview の単一エントリ）
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
  /**
   * モデル別内訳
   * metadata にモデル名が保存されていないため MVP では MOCK_INTERVIEW_MODEL の単一エントリのみ。
   * コストが存在しない場合は空配列。
   */
  modelBreakdown: Array<{
    model: string;
    estimatedUsd: number;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
  }>;
  /**
   * 機能別内訳
   * interview（本番面接）は llm_cost_estimate を記録しないため mock-interview のみ。
   * コストが存在しない場合は空配列。
   */
  featureBreakdown: Array<{
    feature: string;
    estimatedUsd: number;
    inputTokens: number;
    outputTokens: number;
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

  // ------------------------------------------------------------------
  // 4. モデル別内訳
  //    metadata に model フィールドが存在しないため、コストがある場合は
  //    MOCK_INTERVIEW_MODEL の単一エントリとしてグローバル集計値をそのまま使用する。
  //    コストが 0（行なし）の場合は空配列。
  //    sessionCount はグローバル集計と同じ WHERE 条件で COUNT を取得する。
  // ------------------------------------------------------------------
  const sessionCountRows = await db
    .select({ cnt: sql<string>`COUNT(${mockInterview.id})` })
    .from(mockInterview)
    .where(
      sql`${mockInterview.metadata} IS NOT NULL
        AND ${mockInterview.metadata}->'llm_cost_estimate' IS NOT NULL`,
    );
  const totalSessionCount = Number(sessionCountRows[0]?.cnt ?? 0);

  const modelBreakdown: LlmCostMetrics['modelBreakdown'] =
    totalUsd > 0
      ? [
          {
            model: MOCK_INTERVIEW_MODEL,
            estimatedUsd: totalUsd,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            sessionCount: totalSessionCount,
          },
        ]
      : [];

  // ------------------------------------------------------------------
  // 5. 機能別内訳
  //    interview（本番面接）は llm_cost_estimate を記録していないため
  //    mock-interview のみのエントリになる（上流 assessment-engine の制約）。
  //    sessionCount はモデル別内訳と同じ値を再利用する。
  //    コストが 0（行なし）の場合は空配列。
  // ------------------------------------------------------------------
  const featureBreakdown: LlmCostMetrics['featureBreakdown'] =
    modelBreakdown.length > 0
      ? [
          {
            feature: '模擬面接',
            estimatedUsd: totalUsd,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            sessionCount: totalSessionCount,
          },
        ]
      : [];

  return {
    totalUsd,
    totalInputTokens,
    totalOutputTokens,
    dailyTrend,
    topCandidates,
    modelBreakdown,
    featureBreakdown,
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

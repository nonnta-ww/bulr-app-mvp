import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '../../client';
import { candidate } from '../../schema/candidate';
import { interviewSession } from '../../schema/interview-session';
import { interviewTurn } from '../../schema/interview-turn';
import { patternCoverage } from '../../schema/pattern-coverage';
import { user } from '../../schema/auth';

// -----------------------------------------------------------------------
// 公開型
// -----------------------------------------------------------------------

export type SessionListItem = {
  id: string;
  candidate_name: string;
  interviewer_email: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  started_at: string; // ISO 8601 string
  completed_at: string | null;
  turn_count: number;
  avg_score: number | null;
  review_status: 'pending' | 'partial' | 'reviewed';
};

// ListQueryParams は apps/web/app/admin/_lib/list-query-params.ts と同型
// （循環依存を避けるためここでローカル定義）
export type ListQueryParams = {
  reviewStatus: 'all' | 'pending' | 'partial' | 'reviewed';
  status: 'all' | 'in_progress' | 'completed' | 'abandoned';
  sortBy: 'started_at' | 'candidate_name' | 'avg_score';
  sortOrder: 'asc' | 'desc';
};

// -----------------------------------------------------------------------
// 内部ヘルパー: review_status の CASE 式
// （apps/web/app/admin/_lib/review-status.ts の computeReviewStatus と同等ロジックを
//   SQL レベルでインライン化。パッケージ境界違反を避けるため import 禁止）
//
// ロジック:
//   total = 0 OR pending = total  → 'pending'
//   pending = 0 (AND total > 0)   → 'reviewed'
//   それ以外 (0 < pending < total) → 'partial'
//
// 将来ロジックを変える場合は review-status.ts とここの両方を同期更新すること。
// -----------------------------------------------------------------------
function reviewStatusCase(
  total: SQL,
  pending: SQL,
): SQL<'pending' | 'partial' | 'reviewed'> {
  return sql<'pending' | 'partial' | 'reviewed'>`
    CASE
      WHEN ${total} = 0 OR ${pending} = ${total} THEN 'pending'
      WHEN ${pending} = 0 THEN 'reviewed'
      ELSE 'partial'
    END
  `;
}

// -----------------------------------------------------------------------
// メインクエリ関数
// -----------------------------------------------------------------------

export async function sessionListQuery(
  params: ListQueryParams,
): Promise<SessionListItem[]> {
  const { reviewStatus, status, sortBy, sortOrder } = params;

  // ------------------------------------------------------------------
  // 集約サブクエリ (pattern_coverage)
  //   per session_id:
  //     - total_coverage: COUNT(*)
  //     - pending_coverage: COUNT(*) WHERE manual_evaluation IS NULL
  //     - avg_score: AVG of 5-dim mean per coverage
  //
  // 5次元の平均 = (authenticity + judgment + scope + meta_cognition + ai_literacy) / 5
  // JSONB の数値フィールドを ::numeric でキャスト
  // ------------------------------------------------------------------
  const coverageAgg = db
    .select({
      session_id: patternCoverage.session_id,
      total_coverage: sql<number>`COUNT(*)`.as('total_coverage'),
      pending_coverage:
        sql<number>`COUNT(*) FILTER (WHERE ${patternCoverage.manual_evaluation} IS NULL)`.as(
          'pending_coverage',
        ),
      avg_score: sql<number | null>`
        AVG(
          (
            (${patternCoverage.llm_evaluation}->>'authenticity')::numeric +
            (${patternCoverage.llm_evaluation}->>'judgment')::numeric +
            (${patternCoverage.llm_evaluation}->>'scope')::numeric +
            (${patternCoverage.llm_evaluation}->>'meta_cognition')::numeric +
            (${patternCoverage.llm_evaluation}->>'ai_literacy')::numeric
          ) / 5.0
        )
      `.as('avg_score'),
    })
    .from(patternCoverage)
    .groupBy(patternCoverage.session_id)
    .as('coverage_agg');

  // ------------------------------------------------------------------
  // 集約サブクエリ (interview_turn)
  //   per session_id: total turn count
  // ------------------------------------------------------------------
  const turnAgg = db
    .select({
      session_id: interviewTurn.session_id,
      turn_count: sql<number>`COUNT(*)`.as('turn_count'),
    })
    .from(interviewTurn)
    .groupBy(interviewTurn.session_id)
    .as('turn_agg');

  // ------------------------------------------------------------------
  // review_status CASE 式 (サブクエリの集約値を参照)
  // ------------------------------------------------------------------
  const totalSql = sql`COALESCE(${coverageAgg.total_coverage}, 0)`;
  const pendingSql = sql`COALESCE(${coverageAgg.pending_coverage}, 0)`;
  const reviewStatusSql = reviewStatusCase(totalSql, pendingSql);

  // ------------------------------------------------------------------
  // WHERE 条件の構築
  // ------------------------------------------------------------------
  const conditions: (SQL | undefined)[] = [
    // status = 'draft' は常に除外
    ne(interviewSession.status, 'draft'),
  ];

  // status フィルタ
  if (status !== 'all') {
    conditions.push(eq(interviewSession.status, status));
  }

  // reviewStatus フィルタ: CASE 式の結果で絞り込む
  // derived query の HAVING に相当するが、Drizzle では outer subquery として扱う
  // ここでは sql テンプレートで直接 CASE 式を WHERE 条件に埋め込む
  if (reviewStatus !== 'all') {
    conditions.push(
      sql`${reviewStatusSql} = ${reviewStatus}`,
    );
  }

  const whereClause = and(...conditions.filter((c): c is SQL => c !== undefined));

  // ------------------------------------------------------------------
  // ORDER BY の構築
  // ------------------------------------------------------------------
  let orderByClause: SQL;
  const avgScoreSql = sql`${coverageAgg.avg_score}`;

  if (sortBy === 'avg_score') {
    // NULLS LAST: 両順序で null を末尾
    if (sortOrder === 'asc') {
      orderByClause = sql`${avgScoreSql} ASC NULLS LAST`;
    } else {
      orderByClause = sql`${avgScoreSql} DESC NULLS LAST`;
    }
  } else if (sortBy === 'candidate_name') {
    if (sortOrder === 'asc') {
      orderByClause = asc(candidate.name) as unknown as SQL;
    } else {
      orderByClause = desc(candidate.name) as unknown as SQL;
    }
  } else {
    // sortBy === 'started_at' (default)
    if (sortOrder === 'asc') {
      orderByClause = asc(interviewSession.started_at) as unknown as SQL;
    } else {
      orderByClause = desc(interviewSession.started_at) as unknown as SQL;
    }
  }

  // ------------------------------------------------------------------
  // メインクエリ実行
  // ------------------------------------------------------------------
  const rows = await db
    .select({
      id: interviewSession.id,
      candidate_name: candidate.name,
      interviewer_email: user.email,
      status: interviewSession.status,
      started_at: interviewSession.started_at,
      completed_at: interviewSession.completed_at,
      turn_count: sql<number>`COALESCE(${turnAgg.turn_count}, 0)`,
      avg_score: coverageAgg.avg_score,
      review_status: reviewStatusSql,
    })
    .from(interviewSession)
    .innerJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
    .innerJoin(user, eq(interviewSession.interviewer_id, user.id))
    .leftJoin(coverageAgg, eq(interviewSession.id, coverageAgg.session_id))
    .leftJoin(turnAgg, eq(interviewSession.id, turnAgg.session_id))
    .where(whereClause)
    .orderBy(orderByClause);

  // ------------------------------------------------------------------
  // 戻り値のマッピング
  // ------------------------------------------------------------------
  return rows.map((row) => ({
    id: row.id,
    candidate_name: row.candidate_name,
    interviewer_email: row.interviewer_email,
    status: row.status as 'in_progress' | 'completed' | 'abandoned',
    started_at:
      row.started_at instanceof Date
        ? row.started_at.toISOString()
        : (row.started_at ?? ''),
    completed_at:
      row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : (row.completed_at ?? null),
    turn_count: Number(row.turn_count),
    avg_score: row.avg_score !== null ? Number(row.avg_score) : null,
    review_status: row.review_status as 'pending' | 'partial' | 'reviewed',
  }));
}

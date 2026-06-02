import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '../client';
import { mockInterview } from '../schema/mock-interview';
import type { FormativeFeedback, MockInterview, MockInterviewMetadata } from '../schema/mock-interview';

// ---------------------------------------------------------------------------
// countMockInterviewsInQuotaWindow
// ---------------------------------------------------------------------------

/**
 * クォータウィンドウ内の mock_interview 件数を返す。
 *
 * ウィンドウ開始 = GREATEST(当月1日 UTC 00:00, COALESCE(quotaResetAt, 当月1日 UTC 00:00))
 * すなわち「今月の開始日」か「quota_reset_at」のうち遅い方。
 * quotaResetAt が null の場合は当月1日を使用する（COALESCE の挙動と同等）。
 */
export async function countMockInterviewsInQuotaWindow(
  candidateProfileId: string,
  quotaResetAt: Date | null,
): Promise<number> {
  const now = new Date();
  // 当月1日 UTC 00:00:00
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // GREATEST(monthStart, COALESCE(quotaResetAt, monthStart))
  const windowStart =
    quotaResetAt !== null && quotaResetAt > monthStart ? quotaResetAt : monthStart;

  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(mockInterview)
    .where(
      and(
        eq(mockInterview.candidateProfileId, candidateProfileId),
        gte(mockInterview.createdAt, windowStart),
      ),
    );

  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// createMockInterview
// ---------------------------------------------------------------------------

/**
 * mock_interview レコードを INSERT し、生成されたレコードを返す。
 */
export async function createMockInterview(input: {
  candidateProfileId: string;
  patternCode: string;
}): Promise<MockInterview> {
  const rows = await db
    .insert(mockInterview)
    .values({
      candidateProfileId: input.candidateProfileId,
      patternCode: input.patternCode,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('createMockInterview: INSERT returned no rows');
  }
  return row;
}

// ---------------------------------------------------------------------------
// getMockInterviewByIdAndOwner
// ---------------------------------------------------------------------------

/**
 * ID と candidateProfileId（所有者）が一致する mock_interview を返す。
 * 一致しない場合は null を返す。
 */
export async function getMockInterviewByIdAndOwner(
  id: string,
  candidateProfileId: string,
): Promise<MockInterview | null> {
  const rows = await db
    .select()
    .from(mockInterview)
    .where(
      and(
        eq(mockInterview.id, id),
        eq(mockInterview.candidateProfileId, candidateProfileId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// incrementMockInterviewTurnCount
// ---------------------------------------------------------------------------

/**
 * turn_count を 1 増やす。
 */
export async function incrementMockInterviewTurnCount(id: string): Promise<void> {
  await db
    .update(mockInterview)
    .set({
      turnCount: sql`${mockInterview.turnCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(mockInterview.id, id));
}

// ---------------------------------------------------------------------------
// finalizeMockInterview
// ---------------------------------------------------------------------------

/**
 * セッション終了時の UPDATE: ended_at / formative_feedback / turn_count / metadata / updated_at を設定する。
 */
export async function finalizeMockInterview(
  id: string,
  updates: {
    endedAt: Date;
    formativeFeedback: FormativeFeedback;
    turnCount: number;
    metadata: MockInterviewMetadata;
  },
): Promise<void> {
  await db
    .update(mockInterview)
    .set({
      endedAt: updates.endedAt,
      formativeFeedback: updates.formativeFeedback,
      turnCount: updates.turnCount,
      metadata: updates.metadata,
      updatedAt: new Date(),
    })
    .where(eq(mockInterview.id, id));
}

'use server';

/**
 * createMockInterviewSessionAction — パターンを選択してモック面接セッションを作成する Server Action
 *
 * - requireCandidate で認証・candidateProfileId 取得
 * - candidate_profile.quota_reset_at を SELECT してクォータウィンドウ開始点を取得する
 * - countMockInterviewsInQuotaWindow でクォータ検査（>= 3 なら { error } を返す）
 * - createMockInterview で mock_interview レコードを INSERT する
 * - 成功時は /mock-interview/:id へリダイレクトする（redirect は try/catch 外で呼ぶ）
 *
 * Requirements: mock-interview 要件1, 2, 6
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { requireCandidate } from '@bulr/auth/server';
import { db, countMockInterviewsInQuotaWindow, createMockInterview } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';

const MONTHLY_QUOTA = 3;

const createSessionSchema = z.object({
  patternCode: z.string().min(1),
});

export async function createMockInterviewSessionAction(
  patternCode: string,
): Promise<{ error: string }> {
  // 1. 認証・candidateProfileId 取得
  const { candidateProfile: profile } = await requireCandidate();

  // 2. patternCode のバリデーション
  const parsed = createSessionSchema.safeParse({ patternCode });
  if (!parsed.success) {
    return { error: 'パターンコードが無効です' };
  }

  // 3. quota_reset_at を取得する
  const [profileRow] = await db
    .select({ quotaResetAt: candidateProfile.quotaResetAt })
    .from(candidateProfile)
    .where(eq(candidateProfile.id, profile.id))
    .limit(1);

  const quotaResetAt = profileRow?.quotaResetAt ?? null;

  // 4. クォータ検査
  const count = await countMockInterviewsInQuotaWindow(profile.id, quotaResetAt);
  if (count >= MONTHLY_QUOTA) {
    return { error: '今月の上限に達しました（3 回 / 月）' };
  }

  // 5. mock_interview INSERT
  const session = await createMockInterview({
    candidateProfileId: profile.id,
    patternCode: parsed.data.patternCode,
  });

  // 6. redirect（NEXT_REDIRECT は try/catch 外で throw する）
  redirect('/mock-interview/' + session.id);
}

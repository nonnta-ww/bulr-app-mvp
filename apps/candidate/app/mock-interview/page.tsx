/**
 * 模擬面接パターン選択画面（Server Component）
 *
 * - requireCandidate() でガード
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - candidate_profile.quota_reset_at を取得
 * - countMockInterviewsInQuotaWindow でクォータ消費数を取得し、残数 = 3 - count
 * - assessmentPattern の is_active=true 一覧を取得
 * - skill_survey_response が候補者に存在するか boolean で確認
 * - PatternList + QuotaStatus にデータを渡してレンダリング
 *
 * Requirements: 要件1, 要件2
 */

import { redirect } from 'next/navigation';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, countMockInterviewsInQuotaWindow } from '@bulr/db';
import { assessmentPattern, skillSurveyResponse } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';

import { PatternList } from './_components/PatternList';
import { QuotaStatus } from './_components/QuotaStatus';

const MONTHLY_QUOTA = 3;

export default async function MockInterviewPage() {
  // ガード: 未認証 → /sign-in、プロフィール未設定 → /onboarding
  let candidateProfileId: string;
  let quotaResetAt: Date | null;

  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
    quotaResetAt = candidateProfile.quotaResetAt;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  // クォータ消費数を取得し残数を計算
  const usedCount = await countMockInterviewsInQuotaWindow(candidateProfileId, quotaResetAt);
  const remaining = Math.max(0, MONTHLY_QUOTA - usedCount);

  // アクティブなパターン一覧を取得
  const patterns = await db
    .select()
    .from(assessmentPattern)
    .where(eq(assessmentPattern.is_active, true));

  // スキルアンケート回答済みか確認（response_data は読まない）
  const skillSurveyRows = await db
    .select({ id: skillSurveyResponse.id })
    .from(skillSurveyResponse)
    .where(eq(skillSurveyResponse.candidateProfileId, candidateProfileId))
    .limit(1);
  const hasSkillSurvey = skillSurveyRows.length > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">模擬面接</h1>
        <p className="mt-1 text-sm text-gray-600">
          技術的な状況パターンを選んで模擬面接を開始してください。
        </p>
      </div>

      <div className="mb-6">
        <QuotaStatus remaining={remaining} />
      </div>

      <PatternList
        patterns={patterns}
        quotaRemaining={remaining}
        disabled={remaining <= 0}
        hasSkillSurvey={hasSkillSurvey}
      />
    </main>
  );
}

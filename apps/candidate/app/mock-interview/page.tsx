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

import Link from 'next/link';
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
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-8 max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-ink md:text-3xl">模擬面接</h1>
        <p className="text-base text-body md:text-lg">
          実践的なシナリオで面接スキルを磨き、自信を持って本番に臨みましょう。
        </p>
      </header>

      {/* 上部: 残り回数 + スキルアンケート導線 */}
      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <QuotaStatus remaining={remaining} total={MONTHLY_QUOTA} />

        {hasSkillSurvey ? (
          <div className="flex items-start gap-3 rounded-card border border-hairline bg-card p-6 shadow-ambient">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              lightbulb
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">あなたへのおすすめ</h2>
              <p className="mt-1 text-sm leading-relaxed text-body">
                スキルアンケートの回答をもとに、経験や関心に近いパターンへ挑戦すると、より実践的なフィードバックを得やすくなります。
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-card border border-primary/30 bg-primary/10 p-6">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              lightbulb
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">スキルアンケートのお願い</h2>
              <p className="mt-1 text-sm leading-relaxed text-body">
                スキルアンケートに回答すると、あなたの強みと課題に基づいた、よりパーソナライズされた模擬面接シナリオが提案されます。
              </p>
              <Link
                href="/skill-survey"
                className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:opacity-90"
              >
                アンケートに回答する
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        )}
      </div>

      <PatternList patterns={patterns} disabled={remaining <= 0} />
    </main>
  );
}

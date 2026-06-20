/**
 * スキルアンケート一覧ページ（Server Component）
 *
 * - requireCandidate() で認証 + candidate_profile 存在確認
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - isActive = true のアンケート一覧を取得
 * - 本人の診断統計（最終診断日・診断回数）を取得して SurveyList に渡す
 * - SurveyList コンポーネントでカード表示する
 *
 * Requirements: 4.1, 7.1
 */

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getSelfAnalysisStatsForCandidate } from '@bulr/db';
import { skillSurvey } from '@bulr/db/schema';

import { SurveyList, type SurveyStats } from './_components/survey-list';

export default async function SurveyListPage() {
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  const [surveys, stats] = await Promise.all([
    db.select().from(skillSurvey).where(eq(skillSurvey.isActive, true)),
    getSelfAnalysisStatsForCandidate(candidateProfileId),
  ]);

  // surveyId → 診断統計 の Record に変換して SurveyList へ渡す
  const statsBySurveyId: Record<string, SurveyStats> = {};
  for (const s of stats) {
    statsBySurveyId[s.surveyId] = {
      diagnosisCount: s.diagnosisCount,
      lastDiagnosedAt: s.lastDiagnosedAt,
    };
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">スキルアンケート</h1>
        <p className="mt-1 text-sm text-gray-600">
          職種別のスキルアンケートに回答して、あなたの技術スタックを整理しましょう。
        </p>
      </div>
      <SurveyList surveys={surveys} statsBySurveyId={statsBySurveyId} />
    </main>
  );
}

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
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-10 max-w-3xl md:mb-12">
        <h1 className="mb-3 text-2xl font-bold text-ink md:text-3xl">スキルアンケート</h1>
        <p className="text-base leading-relaxed text-body md:text-lg">
          現在の技術スタックと習熟度を記録しましょう。自己分析やキャリア提案の精度が高まります。
        </p>
      </header>
      <SurveyList surveys={surveys} statsBySurveyId={statsBySurveyId} />
    </main>
  );
}

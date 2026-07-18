/**
 * チームワーク・スタイル診断 独立ルート（Server Component, task 5.6）
 *
 * 認証済み候補者本人の対人・協働回答をライブ算出し、充足度に応じて結果を単体で表示する専用ページ。
 * 永続化・Server Action・LLM なし（再訪時はライブ算出により最新回答が自然に反映される・R3.1/R3.6）。
 *
 * 手順:
 *   1. 認証ガード（requireCandidate）。未認証は sign-in / プロフィール未作成は onboarding へ redirect（R1.1/R1.2）。
 *   2. 本人所有スコープで回答 + アンケート id を取得（candidateProfile.id フィルタ・R1.3/R1.4）。
 *   3. 回答を写像し、profile（スタイル）・growthAdvice（成長）・cultureAffinity（親和性）をライブ算出。保存しない（R3.1）。
 *   4. アンケートへの deep-link を解決（未 seed 時は一覧フォールバック・R2.2/R2.3）。
 *   5. TeamworkStyleResult へシリアライズ可能な props を渡して描画。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 3.1, 3.6, 9.1, 10.1, 10.2
 * Boundary: page
 */

import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import {
  getCandidateTeamworkStyleResponse,
  getTeamworkStyleSurveyId,
} from '@bulr/db';

import { TeamworkStyleResult } from './_components/teamwork-style-result';
import { mapTeamworkAnswers } from '../_lib/teamwork-style/answers';
import { deriveCultureAffinity } from '../_lib/teamwork-style/culture-affinity';
import { deriveGrowthAdvice } from '../_lib/teamwork-style/growth';
import { scoreTeamworkStyle } from '../_lib/teamwork-style/score';

export default async function TeamworkStyleDiagnosisPage() {
  // ── アクセス制御 ──（R1.1/R1.2）
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

  // ── 本人所有スコープで回答 + アンケート id を取得 ──（R1.3/R1.4）
  const [response, teamworkStyleSurveyId] = await Promise.all([
    getCandidateTeamworkStyleResponse(candidateProfileId),
    getTeamworkStyleSurveyId(),
  ]);

  // ライブ算出（永続化なし → 再訪時に最新回答を反映・R3.1/R3.6）。
  const { styleAnswers, growthAnswers } = mapTeamworkAnswers(response);
  const profile = scoreTeamworkStyle(styleAnswers);
  const growthAdvice = deriveGrowthAdvice(growthAnswers);
  const cultureAffinity = deriveCultureAffinity(profile.code ?? undefined);

  // アンケートへの deep-link（未 seed 時は一覧へフォールバック・R2.2/R2.3）。
  const surveyHref = teamworkStyleSurveyId
    ? `/skill-survey/${teamworkStyleSurveyId}`
    : '/skill-survey';

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          あなたのチームワーク・スタイル
        </h1>
        <p className="mt-2 text-sm text-muted">
          アンケートの回答から、あなたが他者・チームとどう関わるか（対人・協働の型）を診断します。
        </p>
      </header>

      <TeamworkStyleResult
        profile={profile}
        growthAdvice={growthAdvice}
        cultureAffinity={cultureAffinity}
        surveyHref={surveyHref}
      />
    </main>
  );
}

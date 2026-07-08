/**
 * プレイスタイル診断 独立ルート（Server Component, task 4.4）
 *
 * 認証済み候補者本人の気質回答をライブ算出し、充足度に応じてプレイスタイル結果を単体で表示する
 * 専用ページ。永続化・Server Action・LLM なし（再訪時はライブ算出により最新回答が自然に反映される）。
 *
 * 手順:
 *   1. 認証ガード（requireCandidate）。未認証は sign-in / onboarding へ redirect（Req 6.4）。
 *   2. 本人所有スコープで playstyle 回答 + 気質アンケート id を取得（candidateProfile.id フィルタ, Req 6.4）。
 *   3. profile をライブ算出（scoreTemperament ∘ mapTemperamentAnswers）。保存はしない（Req 3.5）。
 *   4. 気質アンケートへの deep-link を解決（未 seed 時は一覧フォールバック, Req 6.1）。
 *   5. PlaystyleResult へシリアライズ可能な props（profile / href）を渡して描画（Req 2.5）。
 *
 * Requirements: 2.5, 3.5, 6.1, 6.4
 * Boundary: playstyle-diagnosis page
 */

import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import { getCandidatePlaystyleResponse, getPlaystyleSurveyId } from '@bulr/db';

import { PlaystyleResult } from './_components/playstyle-result';
import { mapTemperamentAnswers } from '../_lib/temperament/answers';
import { scoreTemperament } from '../_lib/temperament/score';

export default async function PlaystyleDiagnosisPage() {
  // ── アクセス制御 ──（Req 6.4）
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

  // ── 本人所有スコープで playstyle 回答 + 気質アンケート id を取得 ──（Req 6.4）
  const [playstyle, playstyleSurveyId] = await Promise.all([
    getCandidatePlaystyleResponse(candidateProfileId),
    getPlaystyleSurveyId(),
  ]);

  // 気質プロフィールをライブ算出（永続化なし → 再訪時に最新回答を反映, Req 3.5）。
  const profile = scoreTemperament(mapTemperamentAnswers(playstyle));

  // 気質アンケートへの deep-link（未 seed 時は一覧へフォールバック, Req 6.1）。
  const playstyleSurveyHref = playstyleSurveyId
    ? `/skill-survey/${playstyleSurveyId}`
    : '/skill-survey';

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          あなたのプレイスタイル
        </h1>
        <p className="mt-2 text-sm text-muted">
          気質アンケートの回答から、あなたの開発プレイスタイル（気質タイプ）を診断します。
        </p>
      </header>

      <PlaystyleResult
        profile={profile}
        playstyleSurveyHref={playstyleSurveyHref}
      />
    </main>
  );
}

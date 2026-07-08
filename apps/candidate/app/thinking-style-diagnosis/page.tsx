/**
 * 思考スタイル診断 独立ルート（Server Component, task 4.4）
 *
 * 認証済み候補者本人の思考スタイル回答をライブ算出し、充足度に応じて結果を単体で表示する
 * 専用ページ。永続化・Server Action・LLM なし（再訪時はライブ算出により最新回答が自然に反映される）。
 *
 * 手順:
 *   1. 認証ガード（requireCandidate）。未認証は sign-in / onboarding へ redirect（Req 6.3）。
 *   2. 本人所有スコープで思考スタイル回答 + アンケート id を取得（candidateProfile.id フィルタ, Req 6.3）。
 *   3. profile をライブ算出（scoreThinkingStyle ∘ mapThinkingStyleAnswers）。保存はしない（Req 3.5）。
 *   4. 思考スタイルアンケートへの deep-link を解決（未 seed 時は一覧フォールバック, Req 6.1）。
 *   5. ThinkingStyleResult へシリアライズ可能な props（profile / href）を渡して描画（Req 2.5）。
 *
 * Requirements: 2.5, 3.5, 6.1, 6.2, 6.3
 * Boundary: thinking-style-diagnosis page
 */

import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import { getCandidateThinkingStyleResponse, getThinkingStyleSurveyId } from '@bulr/db';

import { ThinkingStyleResult } from './_components/thinking-style-result';
import { mapThinkingStyleAnswers } from '../_lib/thinking-style/answers';
import { scoreThinkingStyle } from '../_lib/thinking-style/score';

export default async function ThinkingStyleDiagnosisPage() {
  // ── アクセス制御 ──（Req 6.3）
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

  // ── 本人所有スコープで思考スタイル回答 + アンケート id を取得 ──（Req 6.3）
  const [response, thinkingStyleSurveyId] = await Promise.all([
    getCandidateThinkingStyleResponse(candidateProfileId),
    getThinkingStyleSurveyId(),
  ]);

  // 思考スタイルプロフィールをライブ算出（永続化なし → 再訪時に最新回答を反映, Req 3.5）。
  const profile = scoreThinkingStyle(mapThinkingStyleAnswers(response));

  // 思考スタイルアンケートへの deep-link（未 seed 時は一覧へフォールバック, Req 6.1）。
  const thinkingStyleSurveyHref = thinkingStyleSurveyId
    ? `/skill-survey/${thinkingStyleSurveyId}`
    : '/skill-survey';

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          あなたの思考スタイル
        </h1>
        <p className="mt-2 text-sm text-muted">
          思考スタイルアンケートの回答から、あなたの思考の傾向（4軸）を診断します。
        </p>
      </header>

      <ThinkingStyleResult
        profile={profile}
        thinkingStyleSurveyHref={thinkingStyleSurveyHref}
      />
    </main>
  );
}

/**
 * 自己分析 一覧ページ（Server Component）
 *
 * 候補者が回答済みのアンケートをカード一覧で表示する。
 * - 認証ガード（requireCandidate）
 * - 回答0件 → 「先にアンケートに回答しましょう」案内（/skill-survey）
 * - 1件以上 → SurveyAnalysisCard のリスト（各カードから /self-analysis/[surveyId] へ）
 *
 * 各アンケートの分析詳細・生成は /self-analysis/[surveyId] に委譲する。
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import { getAnsweredSurveysForCandidate } from '@bulr/db';

import { SurveyAnalysisCard } from './_components/survey-analysis-card';

export default async function SelfAnalysisPage() {
  // ── アクセス制御 ──
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

  const surveys = await getAnsweredSurveysForCandidate(candidateProfileId);

  // ── NoResponse 状態 ──
  if (surveys.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
          <p className="mt-1 text-sm text-gray-600">
            アンケートの回答をもとに、あなたの強み・弱み・成長アクションを生成します。
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-lg border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-amber-900">
              先にアンケートに回答しましょう
            </h2>
            <p className="text-sm text-amber-700">
              自己分析を生成するには、スキルアンケートへの回答が必要です。
              <br />
              まずアンケートに回答してから、こちらで自己分析を生成してください。
            </p>
          </div>
          <Link
            href="/skill-survey"
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            アンケート一覧へ
          </Link>
        </div>
      </main>
    );
  }

  // ── 一覧表示 ──
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
        <p className="mt-1 text-sm text-gray-600">
          回答済みのアンケートを選んで、強み・弱み・成長アクションを確認しましょう。
        </p>
      </div>

      <div className="space-y-4">
        {surveys.map((summary) => (
          <SurveyAnalysisCard key={summary.surveyId} summary={summary} />
        ))}
      </div>
    </main>
  );
}

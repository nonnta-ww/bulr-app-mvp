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
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
        <header className="mb-10 max-w-3xl">
          <h1 className="mb-3 text-2xl font-bold text-ink md:text-3xl">自己分析</h1>
          <p className="text-base leading-relaxed text-body md:text-lg">
            アンケートの回答をもとに、あなたの強み・伸びしろ・成長アクションを生成します。
          </p>
        </header>

        <div className="flex flex-col items-center gap-6 rounded-card border border-primary/30 bg-primary/10 px-6 py-12 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-ink">先にアンケートに回答しましょう</h2>
            <p className="text-sm text-body">
              自己分析を生成するには、スキルアンケートへの回答が必要です。
              <br />
              まずアンケートに回答してから、こちらで自己分析を生成してください。
            </p>
          </div>
          <Link
            href="/skill-survey"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
          >
            アンケート一覧へ
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </main>
    );
  }

  // ── 一覧表示 ──
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-10 max-w-3xl">
        <h1 className="mb-3 text-2xl font-bold text-ink md:text-3xl">自己分析</h1>
        <p className="text-base leading-relaxed text-body md:text-lg">
          回答済みのアンケートを選んで、強み・伸びしろ・成長アクションを確認しましょう。
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {surveys.map((summary) => (
          <SurveyAnalysisCard key={summary.surveyId} summary={summary} />
        ))}
      </div>
    </main>
  );
}

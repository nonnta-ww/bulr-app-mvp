/**
 * 自己分析 詳細ページ（Server Component）
 *
 * params.surveyId のアンケートに対する自己分析を表示する。
 * - 認証ガード（requireCandidate）
 * - 当該候補者が surveyId に回答済みでなければ一覧へ redirect
 * - getSelfAnalysis / getSelfAnalysisHistory を surveyId で取得
 * - 表示状態（Empty/VizOnly/Stale/Complete）は SelfAnalysisView に委譲
 *
 * 旧 /self-analysis/page.tsx の「最新1件自動表示」ロジックを surveyId 駆動へ移設したもの。
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import {
  getLatestResponseSubmittedAt,
  getSelfAnalysis,
  getSelfAnalysisHistory,
} from '@bulr/db';

import { HistorySection } from '../_components/history-section';
import { SelfAnalysisView } from '../_components/self-analysis-view';

interface PageProps {
  params: Promise<{ surveyId: string }>;
}

export default async function SelfAnalysisDetailPage({ params }: PageProps) {
  const { surveyId } = await params;

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

  // ── 当該 survey への回答有無で所有確認。未回答なら一覧へ ──
  const latestSubmittedAt = await getLatestResponseSubmittedAt(candidateProfileId, surveyId);
  if (latestSubmittedAt === null) {
    redirect('/self-analysis');
  }

  // ── 分析と版履歴を取得 ──
  const [record, history] = await Promise.all([
    getSelfAnalysis(candidateProfileId, surveyId),
    getSelfAnalysisHistory(candidateProfileId, surveyId),
  ]);

  // ── 陳腐化判定（最新回答日 > 分析生成元）──
  const isStale: boolean = record !== null && latestSubmittedAt > record.sourceSubmittedAt;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/self-analysis" className="hover:underline">
          ← 自己分析の一覧に戻る
        </Link>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
        <p className="mt-1 text-sm text-gray-600">
          アンケートの回答をもとに、あなたの強み・弱み・成長アクションを確認できます。
        </p>
      </div>

      <div className="space-y-10">
        <SelfAnalysisView record={record} isStale={isStale} surveyId={surveyId} />
        <HistorySection versions={history} />
      </div>
    </main>
  );
}

/**
 * 自己分析ページ（Server Component）
 *
 * アクセス制御（Req 7.1, 7.2）:
 *   - requireCandidate() で認証 + candidate_profile 存在確認
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 *   - それ以外の AuthError は再スロー
 *   - 以降のクエリは candidateProfile.id で本人のみに限定
 *
 * 表示状態の分岐（design.md §表示状態 stateDiagram 準拠）:
 *   1. NoResponse（Req 1.3, 8.2）:
 *        getAnsweredSurveyForCandidate が null → skill-survey 未回答の案内 + /skill-survey への Link
 *        self-analysis-view には渡さず、ページが直接 NoResponse UI を出す。
 *   2. Empty（Req 8.2）:
 *        answered あり、record === null → SelfAnalysisView(record=null, isStale=false)
 *   3. VizOnly（Req 4.1）:
 *        record あり & llmOutput === null → SelfAnalysisView(record, isStale=false)
 *   4. Stale（Req 5.1, 5.3）:
 *        record あり & answered.submittedAt > record.sourceSubmittedAt
 *        → SelfAnalysisView(record, isStale=true)
 *   5. Complete（Req 6.3）:
 *        record あり & llmOutput あり & !stale → SelfAnalysisView(record, isStale=false)
 *
 * 版履歴（Req 3.3, 3.4, 5.4, 6.1）:
 *   getSelfAnalysisHistory で過去版を昇順取得し HistorySection に渡す。
 *   0件のとき HistorySection は null を返す（非表示）。
 *   最新版未生成でも過去版があれば履歴・推移を閲覧可能（Req 3.4）。
 *
 * 再訪時の挙動（Req 6.3）:
 *   保存済み self_analysis を再生成せずそのまま表示するだけ。
 *   生成は _actions/generate-self-analysis.ts の明示操作（GenerateButton 経由）。
 *
 * Requirements: 1.1, 1.3, 3.3, 3.4, 4.1, 5.1, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 8.2
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import {
  getAnsweredSurveyForCandidate,
  getSelfAnalysis,
  getSelfAnalysisHistory,
} from '@bulr/db';

import { HistorySection } from './_components/history-section';
import { SelfAnalysisView } from './_components/self-analysis-view';

export default async function SelfAnalysisPage() {
  // ── アクセス制御（Req 7.1, 7.2）────────────────────────────────────────
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

  // ── データ取得（本人 ID で限定）────────────────────────────────────────

  // Step 1: 候補者が回答済みの survey を特定（Req 1.3）
  const answered = await getAnsweredSurveyForCandidate(candidateProfileId);

  // ── NoResponse 状態（Req 1.3, 8.2）─────────────────────────────────────
  // skill-survey 未回答の場合はここで返す。SelfAnalysisView には渡さない。
  if (answered === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
          <p className="mt-1 text-sm text-gray-600">
            skill-survey の回答をもとに、あなたの強み・弱み・成長アクションを生成します。
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-lg border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-amber-900">
              先に skill-survey に回答しましょう
            </h2>
            <p className="text-sm text-amber-700">
              自己分析を生成するには、skill-survey への回答が必要です。
              <br />
              まず skill-survey に回答してから、こちらで自己分析を生成してください。
            </p>
          </div>
          <Link
            href="/skill-survey"
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            skill-survey へ
          </Link>
        </div>
      </main>
    );
  }

  // Step 2: 保存済み自己分析と版履歴を並列取得（Req 5.3, 6.1, 6.3 — 本人 ID + survey ID で所有確認）
  const [record, history] = await Promise.all([
    getSelfAnalysis(candidateProfileId, answered.surveyId),
    getSelfAnalysisHistory(candidateProfileId, answered.surveyId),
  ]);

  // Step 3: 陳腐化判定（Req 5.1）
  // 最新 skill-survey 回答の submittedAt が self_analysis.sourceSubmittedAt より新しい場合を陳腐化とみなす。
  // record が null（未生成）の場合は isStale = false（陳腐化の概念が適用されない）。
  const isStale: boolean =
    record !== null && answered.submittedAt > record.sourceSubmittedAt;

  // ── Empty / VizOnly / Stale / Complete — SelfAnalysisView に委譲（Req 6.3）
  // HistorySection は 0件のとき null を返す（非表示）。
  // 最新版未生成でも過去版があれば履歴・推移を閲覧可能（Req 3.4）。
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">自己分析</h1>
        <p className="mt-1 text-sm text-gray-600">
          skill-survey の回答をもとに、あなたの強み・弱み・成長アクションを確認できます。
        </p>
      </div>

      <div className="space-y-10">
        {/* 保存済み自己分析を再生成なしに表示（Req 6.3）。生成は GenerateButton 経由の明示操作。 */}
        <SelfAnalysisView record={record} isStale={isStale} />

        {/* 版履歴・成長推移（Req 3.3, 3.4, 5.4）。0件のとき非表示。 */}
        <HistorySection versions={history} />
      </div>
    </main>
  );
}

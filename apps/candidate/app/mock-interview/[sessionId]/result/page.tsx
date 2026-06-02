/**
 * フィードバック結果画面（Server Component）
 *
 * - requireCandidate() でガード
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - getMockInterviewByIdAndOwner でセッション取得（所有者不一致 / 未存在は notFound()）
 * - formative_feedback が null の場合はローディング表示（フィードバック生成中）
 * - formative_feedback がある場合は 5 次元 + 総合所感をセクション表示
 * - パターン名・セッション日時・ターン数を補足情報として表示
 *
 * Requirements: 要件5
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getMockInterviewByIdAndOwner } from '@bulr/db';
import { assessmentPattern } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';

export default async function MockInterviewResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // ガード: 未認証 → /sign-in、プロフィール未設定 → /onboarding
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

  // セッション取得（所有者不一致 / 未存在は 404）
  const session = await getMockInterviewByIdAndOwner(sessionId, candidateProfileId);
  if (!session) notFound();

  // パターンタイトルを取得
  const patternRows = await db
    .select({ title: assessmentPattern.title })
    .from(assessmentPattern)
    .where(eq(assessmentPattern.code, session.patternCode))
    .limit(1);
  const patternTitle = patternRows[0]?.title ?? session.patternCode;

  // セッション日時のフォーマット
  const sessionDate = session.startedAt ?? session.createdAt;
  const formattedDate = sessionDate.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // フィードバック未生成の場合はローディング表示
  if (session.formativeFeedback == null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">フィードバック結果</h1>
        </div>

        {/* 補足情報 */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <p>
            <span className="font-medium">パターン：</span>
            {patternTitle}
          </p>
          <p>
            <span className="font-medium">実施日時：</span>
            {formattedDate}
          </p>
          <p>
            <span className="font-medium">ターン数：</span>
            {session.turnCount}
          </p>
        </div>

        {/* ローディング表示 */}
        <div className="flex flex-col items-center gap-4 rounded-lg border border-blue-200 bg-blue-50 px-6 py-10 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600" />
          <p className="text-base font-medium text-blue-800">フィードバックを生成中です...</p>
          <p className="text-sm text-blue-600">
            AIがフィードバックを生成しています。しばらくお待ちください。
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/mock-interview"
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            新しい模擬面接を開始
          </Link>
        </div>
      </main>
    );
  }

  const feedback = session.formativeFeedback;

  const dimensions = [
    { label: '真贋', key: 'authenticity', value: feedback.authenticity },
    { label: '判断力', key: 'judgment', value: feedback.judgment },
    { label: '射程', key: 'scope', value: feedback.scope },
    { label: 'メタ認知', key: 'meta_cognition', value: feedback.meta_cognition },
    { label: 'AI活用リテラシー', key: 'ai_literacy', value: feedback.ai_literacy },
  ] as const;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">フィードバック結果</h1>
        <p className="mt-1 text-sm text-gray-600">
          模擬面接のフィードバックをご確認ください。
        </p>
      </div>

      {/* 補足情報 */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <p>
          <span className="font-medium">パターン：</span>
          {patternTitle}
        </p>
        <p>
          <span className="font-medium">実施日時：</span>
          {formattedDate}
        </p>
        <p>
          <span className="font-medium">ターン数：</span>
          {session.turnCount}
        </p>
      </div>

      {/* 5 次元フィードバック */}
      <div className="mb-6 space-y-4">
        {dimensions.map((dim) => (
          <section
            key={dim.key}
            className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <h2 className="mb-2 text-base font-semibold text-gray-900">{dim.label}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {dim.value}
            </p>
          </section>
        ))}
      </div>

      {/* 総合所感 */}
      <section className="mb-8 rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4">
        <h2 className="mb-2 text-base font-semibold text-indigo-900">総合所感</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-indigo-800">
          {feedback.overall}
        </p>
      </section>

      {/* 新しい模擬面接リンク */}
      <div className="text-center">
        <Link
          href="/mock-interview"
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          新しい模擬面接を開始
        </Link>
      </div>
    </main>
  );
}

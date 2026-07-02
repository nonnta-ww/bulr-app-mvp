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
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
        <ResultHeader
          patternTitle={patternTitle}
          formattedDate={formattedDate}
          turnCount={session.turnCount}
        />

        {/* ローディング表示 */}
        <div className="mt-8 flex flex-col items-center gap-4 rounded-card border border-hairline bg-card px-6 py-12 text-center shadow-ambient">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-hairline border-t-primary" />
          <p className="text-base font-bold text-ink">フィードバックを生成中です…</p>
          <p className="text-sm text-body">
            AI がフィードバックを生成しています。しばらくお待ちください。
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/mock-interview"
            className="inline-flex items-center gap-2 rounded-lg border border-hairline px-5 py-2.5 text-sm font-medium text-slate transition-colors hover:border-slate hover:bg-surface-2"
          >
            模擬面接一覧へ
          </Link>
        </div>
      </main>
    );
  }

  const feedback = session.formativeFeedback;

  const dimensions = [
    { label: '真贋', key: 'authenticity', value: feedback.authenticity, symbol: 'fingerprint' },
    { label: '判断力', key: 'judgment', value: feedback.judgment, symbol: 'balance' },
    { label: '射程', key: 'scope', value: feedback.scope, symbol: 'radar' },
    { label: 'メタ認知', key: 'meta_cognition', value: feedback.meta_cognition, symbol: 'psychology' },
    { label: 'AI活用リテラシー', key: 'ai_literacy', value: feedback.ai_literacy, symbol: 'smart_toy' },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      <ResultHeader
        patternTitle={patternTitle}
        formattedDate={formattedDate}
        turnCount={session.turnCount}
      />

      {/* 評価軸フィードバック */}
      <div className="mt-8 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {dimensions.map((dim) => (
          <section
            key={dim.key}
            className="flex h-full flex-col gap-3 rounded-card border border-l-4 border-hairline border-l-primary bg-card p-6 shadow-ambient"
          >
            <header className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                  {dim.symbol}
                </span>
              </div>
              <h2 className="text-lg font-bold text-ink">{dim.label}</h2>
            </header>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{dim.value}</p>
          </section>
        ))}
      </div>

      {/* 総評 */}
      <section className="mt-6 rounded-card border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6 md:p-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            military_tech
          </span>
          <h2 className="text-lg font-bold text-ink">総評</h2>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{feedback.overall}</p>
      </section>

      {/* もう一度練習する */}
      <div className="mt-8 flex justify-center">
        <Link
          href="/mock-interview"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            replay
          </span>
          もう一度練習する
        </Link>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ページヘッダ（フィードバックのメタ情報）
// ---------------------------------------------------------------------------

function ResultHeader({
  patternTitle,
  formattedDate,
  turnCount,
}: {
  patternTitle: string;
  formattedDate: string;
  turnCount: number;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-hairline pb-6 md:flex-row md:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined fill text-slate" aria-hidden="true">
            forum
          </span>
          <span className="text-sm font-medium text-slate">模擬面接フィードバック</span>
        </div>
        <h1 className="text-2xl font-bold text-ink md:text-3xl">{patternTitle}</h1>
      </div>
      <div className="flex gap-4 rounded-lg border border-hairline bg-card px-4 py-2 text-xs">
        <div className="flex flex-col">
          <span className="text-muted">実施日</span>
          <span className="font-medium text-ink">{formattedDate}</span>
        </div>
        <div className="w-px bg-hairline" />
        <div className="flex flex-col">
          <span className="text-muted">ターン数</span>
          <span className="font-medium text-ink">全 {turnCount} ターン</span>
        </div>
      </div>
    </div>
  );
}

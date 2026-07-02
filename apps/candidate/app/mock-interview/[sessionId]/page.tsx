/**
 * 模擬面接チャット画面（Server Component）
 *
 * - requireCandidate() でガード
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - getMockInterviewByIdAndOwner でセッション取得（所有者不一致 / 未存在は notFound()）
 * - session.endedAt が設定済みの場合は結果画面へ redirect
 * - MockInterviewChat Client Component に sessionId / patternCode を渡してレンダリング
 *
 * Requirements: 要件6, 要件10
 */

import { notFound, redirect } from 'next/navigation';

import { eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getMockInterviewByIdAndOwner } from '@bulr/db';
import { assessmentPattern } from '@bulr/db/schema';

import { MockInterviewChat } from './_components/MockInterviewChat';

export default async function MockInterviewSessionPage({
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

  // 既に終了済みの場合は結果画面へリダイレクト
  if (session.endedAt != null) {
    redirect(`/mock-interview/${sessionId}/result`);
  }

  // ヘッダ表示用にパターンのタイトルを取得（未取得でもチャットは成立する）
  const [pattern] = await db
    .select({ title: assessmentPattern.title })
    .from(assessmentPattern)
    .where(eq(assessmentPattern.code, session.patternCode))
    .limit(1);

  return (
    // デスクトップはシェルに上部バーが無いためフルビューポート、モバイルは上部バー分を差し引く
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-dvh">
      <MockInterviewChat
        sessionId={session.id}
        patternCode={session.patternCode}
        patternTitle={pattern?.title ?? '模擬面接'}
      />
    </div>
  );
}

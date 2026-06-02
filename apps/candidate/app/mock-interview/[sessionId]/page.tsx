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

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { getMockInterviewByIdAndOwner } from '@bulr/db';

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

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <MockInterviewChat sessionId={session.id} patternCode={session.patternCode} />
    </div>
  );
}

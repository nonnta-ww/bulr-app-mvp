/**
 * 面接中ページ（Server Component）
 *
 * Requirements: 5.1, 6.1, 20.5
 */

import { notFound, redirect } from 'next/navigation';

import { loadSessionWithTurns } from '@bulr/db/queries';
import { requireUser } from '@/lib/guards';

import { InterviewSessionRunner } from '../_components/interview-session-runner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ sessionId: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InterviewSessionPage({ params }: Props) {
  const { sessionId } = await params;

  // 認証チェック
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    redirect('/sign-in');
  }

  // セッション + ターンをロード（userId でスコープ済み）
  const data = await loadSessionWithTurns(sessionId, user.id);

  if (!data) {
    notFound();
  }

  const { session, candidate, turns, latestProposal } = data;

  // 完了済みの場合はレポートページへリダイレクト
  if (session.status === 'completed') {
    redirect('/interviews/' + sessionId + '/report');
  }

  return (
    <InterviewSessionRunner
      session={session}
      turns={turns}
      latestProposal={latestProposal}
      candidate={candidate}
    />
  );
}

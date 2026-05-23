/**
 * 面接中ページ（Server Component）
 *
 * Requirements: 5.1, 5.3, 5.6, 6.1, 20.5
 */

import { notFound, redirect } from 'next/navigation';
import { inArray } from 'drizzle-orm';

import { db } from '@bulr/db';
import { assessmentPattern } from '@bulr/db/schema';
import type { AssessmentPattern } from '@bulr/db/schema';
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

  const { session, candidate, turns, latestProposal, proposals } = data;

  // 完了済みの場合はレポートページへリダイレクト
  if (session.status === 'completed') {
    redirect('/interviews/' + sessionId + '/report');
  }

  // 計画されたアセスメントパターンを planned_pattern_codes で取得
  // Req 5.3 (patternTitle 表示), 5.6 (進捗計算用)
  let plannedPatterns: AssessmentPattern[] = [];
  if (session.planned_pattern_codes.length > 0) {
    const rows = await db
      .select()
      .from(assessmentPattern)
      .where(inArray(assessmentPattern.code, session.planned_pattern_codes));
    // planned_pattern_codes の順序を保持して並べ替え
    const byCode = new Map(rows.map((p) => [p.code, p]));
    plannedPatterns = session.planned_pattern_codes
      .map((code) => byCode.get(code))
      .filter((p): p is AssessmentPattern => p !== undefined);
  }

  return (
    <InterviewSessionRunner
      session={session}
      turns={turns}
      latestProposal={latestProposal}
      candidate={candidate}
      plannedPatterns={plannedPatterns}
      proposals={proposals}
    />
  );
}

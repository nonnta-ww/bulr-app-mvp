import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { candidate } from '../../schema/candidate';
import { interviewSession } from '../../schema/interview-session';
import { interviewTurn } from '../../schema/interview-turn';
import { questionProposal } from '../../schema/question-proposal';
import type { Candidate } from '../../schema/candidate';
import type { InterviewSession } from '../../schema/interview-session';
import type { InterviewTurn } from '../../schema/interview-turn';
import type { QuestionProposal } from '../../schema/question-proposal';

export type SessionWithTurns = {
  session: InterviewSession;
  candidate: Candidate;
  turns: InterviewTurn[];
  latestProposal: QuestionProposal | null;
  proposals: QuestionProposal[]; // 全 proposal（リロード後の Drawer 復元用）
};

export async function loadSessionWithTurns(
  sessionId: string,
  userId: string,
): Promise<SessionWithTurns | null> {
  // Fetch session + candidate (JOIN), scoped by interviewer_id for ownership check
  const sessionRows = await db
    .select()
    .from(interviewSession)
    .innerJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
    .where(
      and(
        eq(interviewSession.id, sessionId),
        eq(interviewSession.interviewer_id, userId),
      ),
    )
    .limit(1);

  if (sessionRows.length === 0) {
    return null;
  }

  const sessionRow = sessionRows[0]!;
  const session = sessionRow.interview_session;
  const candidateRow = sessionRow.candidate;

  // Fetch all turns ordered by sequence_no asc
  const turns = await db
    .select()
    .from(interviewTurn)
    .where(eq(interviewTurn.session_id, sessionId))
    .orderBy(asc(interviewTurn.sequence_no));

  // 全 proposal を prepared_for_turn_no asc で取得（Drawer 復元用）
  const proposals = await db
    .select()
    .from(questionProposal)
    .where(eq(questionProposal.session_id, sessionId))
    .orderBy(asc(questionProposal.prepared_for_turn_no));

  // 後方互換: 最新の proposal（generated_at desc の先頭）
  const latestProposal =
    proposals.length > 0
      ? [...proposals].sort(
          (a, b) =>
            new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
        )[0] ?? null
      : null;

  return {
    session,
    candidate: candidateRow,
    turns,
    latestProposal,
    proposals,
  };
}

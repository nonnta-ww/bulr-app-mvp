import { and, asc, desc, eq } from 'drizzle-orm';

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

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const sessionRow = sessionRows[0]!;
  const session = sessionRow.interview_session;
  const candidateRow = sessionRow.candidate;

  // Fetch all turns ordered by sequence_no asc
  const turns = await db
    .select()
    .from(interviewTurn)
    .where(eq(interviewTurn.session_id, sessionId))
    .orderBy(asc(interviewTurn.sequence_no));

  // Fetch latest proposal (by generated_at desc, limit 1)
  const latestProposalRows = await db
    .select()
    .from(questionProposal)
    .where(eq(questionProposal.session_id, sessionId))
    .orderBy(desc(questionProposal.generated_at))
    .limit(1);

  const latestProposal = latestProposalRows.length > 0 ? (latestProposalRows[0] ?? null) : null;

  return {
    session,
    candidate: candidateRow,
    turns,
    latestProposal,
  };
}

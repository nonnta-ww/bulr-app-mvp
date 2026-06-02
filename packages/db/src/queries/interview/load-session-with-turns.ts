import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { candidate } from '../../schema/candidate';
import { candidateProfile } from '../../schema/candidate-profile';
import { entry } from '../../schema/entry';
import { interviewSession } from '../../schema/interview-session';
import { interviewTurn } from '../../schema/interview-turn';
import { opening } from '../../schema/opening';
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
  // Fetch session + candidate (LEFT JOIN), scoped by interviewer_id for ownership check.
  // Stage 2 sessions (entry-based: candidate_id IS NULL, entry_id IS NOT NULL) have no
  // direct candidate row, so we LEFT JOIN candidate and also resolve entry → opening →
  // candidateProfile to build a synthetic Candidate for the runner.
  const sessionRows = await db
    .select({
      session: interviewSession,
      candidate: candidate,
      // stage2 フィールド（entry 経由セッションのみ）
      candidateProfileDisplayName: candidateProfile.displayName,
      openingTitle: opening.title,
    })
    .from(interviewSession)
    .leftJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
    .leftJoin(entry, eq(interviewSession.entry_id, entry.id))
    .leftJoin(opening, eq(entry.openingId, opening.id))
    .leftJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
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
  const session = sessionRow.session;

  // Stage 2 セッション（candidate_id=NULL, entry_id あり）の場合は
  // candidateProfile / opening の情報から合成 Candidate を構築する。
  // Stage 1（実 candidate あり）はそのまま使用。
  const candidateRow: Candidate = sessionRow.candidate ?? {
    id: '',
    name: sessionRow.candidateProfileDisplayName ?? '—',
    applied_role: sessionRow.openingTitle ?? '—',
    background_summary: '',
    email: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  };

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

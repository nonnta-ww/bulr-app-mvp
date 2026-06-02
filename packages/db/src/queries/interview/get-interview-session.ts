import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { candidate } from '../../schema/candidate';
import { candidateProfile } from '../../schema/candidate-profile';
import { company } from '../../schema/company';
import { entry } from '../../schema/entry';
import { interviewSession } from '../../schema/interview-session';
import { opening } from '../../schema/opening';
import { resumeDocument } from '../../schema/resume-document';
import { skillSurveyResponse } from '../../schema/skill-survey-response';

// Stage 1 形式（entry_id=NULL）: candidate を JOIN、entry 関連は null
export type InterviewSessionWithCandidate = {
  session: typeof interviewSession.$inferSelect;
  candidate: typeof candidate.$inferSelect;
  entry: null;
  opening: null;
  company: null;
  candidateProfile: null;
  resumeDocument: null;
  skillSurveyResponse: null;
};

// Stage 2 形式（entry_id あり）: entry → opening → company → candidateProfile を JOIN、candidate は null
export type InterviewSessionWithEntry = {
  session: typeof interviewSession.$inferSelect;
  candidate: null;
  entry: typeof entry.$inferSelect;
  opening: typeof opening.$inferSelect;
  company: typeof company.$inferSelect;
  candidateProfile: typeof candidateProfile.$inferSelect;
  resumeDocument: typeof resumeDocument.$inferSelect | null;
  skillSurveyResponse: typeof skillSurveyResponse.$inferSelect | null;
};

export type InterviewSessionResult =
  | ({ kind: 'stage1' } & InterviewSessionWithCandidate)
  | ({ kind: 'stage2' } & InterviewSessionWithEntry);

export async function getInterviewSession(
  sessionId: string,
): Promise<InterviewSessionResult | null> {
  // まずセッション単体を取得して存在確認と entryId 分岐判断を行う
  const sessionRows = await db
    .select()
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  if (sessionRows.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const sessionRow = sessionRows[0]!;

  // Stage 2: entry_id が存在する場合は entry → opening → company → candidateProfile を JOIN
  if (sessionRow.entry_id !== null) {
    const rows = await db
      .select({
        session: interviewSession,
        entry: entry,
        opening: opening,
        company: company,
        candidateProfile: candidateProfile,
        resumeDocument: resumeDocument,
        skillSurveyResponse: skillSurveyResponse,
      })
      .from(interviewSession)
      .innerJoin(entry, eq(interviewSession.entry_id, entry.id))
      .innerJoin(opening, eq(entry.openingId, opening.id))
      .innerJoin(company, eq(opening.companyId, company.id))
      .innerJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
      .leftJoin(resumeDocument, eq(entry.resumeDocumentId, resumeDocument.id))
      .leftJoin(
        skillSurveyResponse,
        eq(entry.skillSurveyResponseId, skillSurveyResponse.id),
      )
      .where(eq(interviewSession.id, sessionId))
      .limit(1);

    if (rows.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = rows[0]!;
    return {
      kind: 'stage2',
      session: row.session,
      candidate: null,
      entry: row.entry,
      opening: row.opening,
      company: row.company,
      candidateProfile: row.candidateProfile,
      resumeDocument: row.resumeDocument ?? null,
      skillSurveyResponse: row.skillSurveyResponse ?? null,
    };
  }

  // Stage 1: entry_id が NULL の場合は candidate を JOIN
  const rows = await db
    .select({
      session: interviewSession,
      candidate: candidate,
    })
    .from(interviewSession)
    .innerJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  if (rows.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const row = rows[0]!;
  return {
    kind: 'stage1',
    session: row.session,
    candidate: row.candidate,
    entry: null,
    opening: null,
    company: null,
    candidateProfile: null,
    resumeDocument: null,
    skillSurveyResponse: null,
  };
}

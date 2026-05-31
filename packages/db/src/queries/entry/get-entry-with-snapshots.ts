import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { candidateProfile } from '../../schema/candidate-profile';
import { company } from '../../schema/company';
import { entry } from '../../schema/entry';
import { opening } from '../../schema/opening';
import { resumeDocument } from '../../schema/resume-document';
import { skillSurveyResponse } from '../../schema/skill-survey-response';

export type EntryWithSnapshots = {
  entry: typeof entry.$inferSelect;
  opening: typeof opening.$inferSelect;
  company: typeof company.$inferSelect;
  candidateProfile: typeof candidateProfile.$inferSelect;
  resumeDocument: typeof resumeDocument.$inferSelect | null;
  skillSurveyResponse: typeof skillSurveyResponse.$inferSelect | null;
};

export async function getEntryWithSnapshots(
  entryId: string,
): Promise<EntryWithSnapshots | null> {
  const rows = await db
    .select({
      entry: entry,
      opening: opening,
      company: company,
      candidateProfile: candidateProfile,
      resumeDocument: resumeDocument,
      skillSurveyResponse: skillSurveyResponse,
    })
    .from(entry)
    .innerJoin(opening, eq(entry.openingId, opening.id))
    .innerJoin(company, eq(opening.companyId, company.id))
    .innerJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
    .leftJoin(resumeDocument, eq(entry.resumeDocumentId, resumeDocument.id))
    .leftJoin(skillSurveyResponse, eq(entry.skillSurveyResponseId, skillSurveyResponse.id))
    .where(eq(entry.id, entryId))
    .limit(1);
  if (rows.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const row = rows[0]!;
  return {
    entry: row.entry,
    opening: row.opening,
    company: row.company,
    candidateProfile: row.candidateProfile,
    resumeDocument: row.resumeDocument ?? null,
    skillSurveyResponse: row.skillSurveyResponse ?? null,
  };
}

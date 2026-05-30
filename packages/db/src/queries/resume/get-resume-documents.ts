import { desc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { resumeDocument } from '../../schema/resume-document';
import type { ResumeDocument } from '../../schema/resume-document';

export async function getResumeDocuments(candidateProfileId: string): Promise<ResumeDocument[]> {
  const result = await db
    .select()
    .from(resumeDocument)
    .where(eq(resumeDocument.candidateProfileId, candidateProfileId))
    .orderBy(desc(resumeDocument.uploadedAt));

  return result;
}

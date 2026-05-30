import { and, eq } from 'drizzle-orm';

import { db } from '../../client';
import { resumeDocument } from '../../schema/resume-document';
import type { ResumeDocument, ResumeKind } from '../../schema/resume-document';

export async function getPrimaryResumeDocument(
  candidateProfileId: string,
  kind: ResumeKind,
): Promise<ResumeDocument | null> {
  const result = await db
    .select()
    .from(resumeDocument)
    .where(
      and(
        eq(resumeDocument.candidateProfileId, candidateProfileId),
        eq(resumeDocument.kind, kind),
        eq(resumeDocument.isPrimary, true),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

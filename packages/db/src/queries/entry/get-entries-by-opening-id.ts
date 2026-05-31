import { desc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { candidateProfile } from '../../schema/candidate-profile';
import { entry } from '../../schema/entry';

export type EntryWithCandidateProfile = {
  entry: typeof entry.$inferSelect;
  candidateProfile: Pick<typeof candidateProfile.$inferSelect, 'id' | 'displayName'>;
};

export async function getEntriesByOpeningId(
  openingId: string,
): Promise<EntryWithCandidateProfile[]> {
  const rows = await db
    .select({
      entry: entry,
      candidateProfile: { id: candidateProfile.id, displayName: candidateProfile.displayName },
    })
    .from(entry)
    .innerJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
    .where(eq(entry.openingId, openingId))
    .orderBy(desc(entry.createdAt));
  return rows;
}

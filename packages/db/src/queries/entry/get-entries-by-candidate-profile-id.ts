import { desc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { company } from '../../schema/company';
import { entry } from '../../schema/entry';
import { opening } from '../../schema/opening';

export type EntryWithOpeningAndCompany = {
  entry: typeof entry.$inferSelect;
  opening: Pick<typeof opening.$inferSelect, 'id' | 'title'>;
  company: Pick<typeof company.$inferSelect, 'id' | 'name'>;
};

export async function getEntriesByCandidateProfileId(
  candidateProfileId: string,
): Promise<EntryWithOpeningAndCompany[]> {
  const rows = await db
    .select({
      entry: entry,
      opening: { id: opening.id, title: opening.title },
      company: { id: company.id, name: company.name },
    })
    .from(entry)
    .innerJoin(opening, eq(entry.openingId, opening.id))
    .innerJoin(company, eq(opening.companyId, company.id))
    .where(eq(entry.candidateProfileId, candidateProfileId))
    .orderBy(desc(entry.createdAt));
  return rows;
}

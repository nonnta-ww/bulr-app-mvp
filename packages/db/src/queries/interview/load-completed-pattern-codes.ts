import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { assessmentPattern } from '../../schema/assessment-pattern';
import { patternCoverage } from '../../schema/pattern-coverage';

export async function loadCompletedPatternCodes(sessionId: string): Promise<string[]> {
  const result = await db
    .select({ code: assessmentPattern.code })
    .from(patternCoverage)
    .innerJoin(assessmentPattern, eq(patternCoverage.pattern_id, assessmentPattern.id))
    .where(eq(patternCoverage.session_id, sessionId));

  return result.map((r) => r.code);
}

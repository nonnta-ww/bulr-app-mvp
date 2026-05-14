import { desc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { interviewTurn } from '../../schema/interview-turn';
import type { InterviewTurn } from '../../schema/interview-turn';

export async function loadRecentTurns(sessionId: string, limit: number = 10): Promise<InterviewTurn[]> {
  const result = await db
    .select()
    .from(interviewTurn)
    .where(eq(interviewTurn.session_id, sessionId))
    .orderBy(desc(interviewTurn.sequence_no))
    .limit(limit);

  return result;
}

// Builds the extended LlmContext required by buildSystemPrompt (Req 9.2, 9.4).
// Centralises the DB look-ups used by /api/interview/turns/next,
// /api/interview/finalize, and /api/interview/proposal/regenerate so all three
// routes feed the same shape into createLlmContext.

import { eq, inArray } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import type { LlmContext } from '@bulr/ai';
import type { AssessmentPattern, InterviewSession } from '@bulr/db/schema';

export interface BuildLlmContextInput {
  session: InterviewSession;
  userId: string;
  /** Optional override of the current target pattern (passed through to Section 12). */
  currentPattern?: AssessmentPattern;
}

/**
 * Loads candidate / interviewer profile / planned patterns / completed coverage
 * for the given session and returns an extended LlmContext.
 *
 * Defensive defaults are applied if the underlying records are missing
 * (e.g. an interviewer that has not yet completed profile setup) so the
 * surrounding route can still proceed with the LLM call.
 */
export async function buildLlmContext(
  input: BuildLlmContextInput,
): Promise<LlmContext> {
  const { session, userId, currentPattern } = input;

  const [candidate, interviewerProfile] = await Promise.all([
    session.candidate_id != null
      ? db.query.candidate.findFirst({
          where: eq(schema.candidate.id, session.candidate_id),
        })
      : Promise.resolve(undefined),
    db.query.userProfile.findFirst({
      where: eq(schema.userProfile.userId, userId),
    }),
  ]);

  const plannedCodes: string[] = session.planned_pattern_codes ?? [];
  const plannedPatterns: AssessmentPattern[] =
    plannedCodes.length > 0
      ? await db.query.assessmentPattern.findMany({
          where: inArray(schema.assessmentPattern.code, plannedCodes),
        })
      : [];

  // Completed coverage: join pattern_coverage with assessment_pattern to get codes.
  const coverageRows = await db
    .select({
      code: schema.assessmentPattern.code,
      level_reached: schema.patternCoverage.level_reached,
      llm_evaluation: schema.patternCoverage.llm_evaluation,
    })
    .from(schema.patternCoverage)
    .innerJoin(
      schema.assessmentPattern,
      eq(schema.patternCoverage.pattern_id, schema.assessmentPattern.id),
    )
    .where(eq(schema.patternCoverage.session_id, session.id));

  const completedCoverage = coverageRows.map((r) => ({
    pattern_code: r.code,
    // pattern_coverage.level_reached is `integer` but constrained to 0..4 by app logic.
    level_reached: r.level_reached as 0 | 1 | 2 | 3 | 4,
    evaluation: r.llm_evaluation,
  }));

  return {
    sessionId: session.id,
    userId,
    interviewerProfile: {
      displayName: interviewerProfile?.displayName ?? 'Interviewer',
      roleInOrg: interviewerProfile?.roleInOrg ?? undefined,
      yearsOfExperience: interviewerProfile?.yearsOfExperience ?? undefined,
    },
    candidateInfo: {
      name: candidate?.name ?? 'Candidate',
      appliedRole: candidate?.applied_role ?? '',
      backgroundSummary: candidate?.background_summary ?? '',
      email: candidate?.email ?? undefined,
    },
    plannedPatterns,
    completedCoverage,
    currentPattern,
  };
}

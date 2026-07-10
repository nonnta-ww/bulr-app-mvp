/**
 * get-worklife-disposition-survey-id.ts — 働き方の志向診断 survey の id 解決。
 *
 * `kind='worklife_disposition'` の survey を1件 SELECT し id を返す（未 seed なら null）。
 * seed は1件のみ投入する前提（thinking-style の対応物と同型）。
 *
 * spec: worklife-disposition-survey, R6.1
 */

import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';

export async function getWorklifeDispositionSurveyId(): Promise<string | null> {
  const rows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'worklife_disposition'))
    .limit(1);

  return rows[0]?.id ?? null;
}

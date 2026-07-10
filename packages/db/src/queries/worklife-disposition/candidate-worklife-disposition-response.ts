/**
 * candidate-worklife-disposition-response.ts — 候補者本人の志向アンケート最新回答取得。
 *
 * `kind='worklife_disposition'` の survey を特定し、本人の最新 response を
 * `getLatestSurveyResponseForAnalysis` に委譲して解決する（本人スコープ限定, R3.5）。
 * 未 seed / 未回答 / 他者データは null。
 *
 * spec: worklife-disposition-survey, R3.1/3.5/6.1
 */

import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';
import {
  getLatestSurveyResponseForAnalysis,
  type SurveyResponseForAnalysis,
} from '../self-analysis/analysis-source-query';

export async function getCandidateWorklifeDispositionResponse(
  candidateProfileId: string,
): Promise<SurveyResponseForAnalysis | null> {
  // kind='worklife_disposition' の survey を1件特定（seed は1件のみ投入する）。
  const surveyRows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'worklife_disposition'))
    .limit(1);

  const worklifeSurvey = surveyRows[0];
  if (!worklifeSurvey) {
    return null;
  }

  // 本人の最新 response を解決（未回答 or 他者データは null）。
  return getLatestSurveyResponseForAnalysis(candidateProfileId, worklifeSurvey.id);
}

/**
 * candidate-teamwork-style-response — 候補者のチームワーク・スタイル（teamwork_style）回答の取得
 *
 * `kind='teamwork_style'` の skill-survey を1件特定し、その survey に対する候補者本人の最新 response を
 * `getLatestSurveyResponseForAnalysis` 経由で返す（カテゴリ名・選択肢ラベル・level 解決済み）。
 * teamwork_style survey が無い / 未回答の場合は null を返す（Req 1.3, 3.6）。
 *
 * candidateProfileId で本人フィルタを適用し、本人のデータのみを返す（Req 1.3）。
 *
 * 依存方向: packages/db は apps/* / packages/ai を import しない。既存 db クエリ
 *   getLatestSurveyResponseForAnalysis のみを再利用する（本人フィルタ込み）。
 */

import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';
import {
  getLatestSurveyResponseForAnalysis,
  type SurveyResponseForAnalysis,
} from '../self-analysis/analysis-source-query';

/**
 * 候補者のチームワーク・スタイル（teamwork_style）診断の最新回答を返す。
 *
 * 1. kind='teamwork_style' の survey を1件特定（無ければ null）。
 * 2. その survey に対する候補者本人の最新 response を解決（未回答なら null）。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID（本人限定）
 */
export async function getCandidateTeamworkStyleResponse(
  candidateProfileId: string,
): Promise<SurveyResponseForAnalysis | null> {
  const surveyRows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'teamwork_style'))
    .limit(1);

  const teamworkStyleSurvey = surveyRows[0];
  if (!teamworkStyleSurvey) {
    return null;
  }

  return getLatestSurveyResponseForAnalysis(candidateProfileId, teamworkStyleSurvey.id);
}

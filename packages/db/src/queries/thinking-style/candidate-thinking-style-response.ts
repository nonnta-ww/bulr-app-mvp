/**
 * candidate-thinking-style-response — 候補者の思考スタイル（thinking_style）回答の取得（思考スタイル診断）
 *
 * `kind='thinking_style'` の skill-survey を1件特定し、その survey に対する候補者本人の
 * 最新 response を `getLatestSurveyResponseForAnalysis` 経由で返す（カテゴリ名・選択肢
 * ラベル・level 解決済み）。thinking_style survey が無い / 未回答の場合は null を返す（Req 6.3）。
 *
 * thinking_style survey は seed で jobType='thinking_style' / kind='thinking_style' として
 * 1件だけ投入される。ここでは kind でフィルタして survey を特定する（jobType 文字列には
 * ハードコード依存しない）。
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
 * 候補者の思考スタイル（thinking_style）診断の最新回答を返す。
 *
 * 1. kind='thinking_style' の survey を1件特定（無ければ null）。
 * 2. その survey に対する候補者本人の最新 response を解決（未回答なら null）。
 *
 * candidateProfileId で本人フィルタを適用し、本人のデータのみを返す（Req 6.3）。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID（本人限定）
 */
export async function getCandidateThinkingStyleResponse(
  candidateProfileId: string,
): Promise<SurveyResponseForAnalysis | null> {
  // kind='thinking_style' の survey を1件特定（seed は1件のみ投入する）。
  const surveyRows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'thinking_style'))
    .limit(1);

  const thinkingStyleSurvey = surveyRows[0];
  if (!thinkingStyleSurvey) {
    return null;
  }

  // 本人の最新 response を解決（未回答 or 他者データは null）。
  return getLatestSurveyResponseForAnalysis(candidateProfileId, thinkingStyleSurvey.id);
}

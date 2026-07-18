/**
 * get-teamwork-style-survey-id — チームワーク・スタイル（teamwork_style）アンケートの survey id 解決（deep-link 用）
 *
 * `kind='teamwork_style'` の skill-survey を1件特定し、その id を返す（Req 2.2）。
 * 診断CTAの deep-link（`/skill-survey/[surveyId]`）が id を必要とするため、seed で投入された
 * teamwork_style survey の id をここで解決する。未投入時は null を返し、呼び手はアンケート一覧
 * `/skill-survey` へフォールバックする（機能低下せず・Req 2.3）。
 *
 * 依存方向: packages/db は apps/* / packages/ai を import しない。skill-survey schema のみに依存する。
 */

import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';

/**
 * チームワーク・スタイル（teamwork_style）survey の id を1件返す。
 *
 * seed（kind='teamwork_style'）で1件だけ投入される想定。kind でフィルタして survey を特定する
 * （jobType 文字列にはハードコード依存しない）。
 *
 * @returns seed 済みなら teamwork_style survey の id、無ければ null。
 */
export async function getTeamworkStyleSurveyId(): Promise<string | null> {
  const rows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'teamwork_style'))
    .limit(1);

  return rows[0]?.id ?? null;
}

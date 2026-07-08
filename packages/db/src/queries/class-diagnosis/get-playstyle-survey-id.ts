/**
 * get-playstyle-survey-id — 気質（playstyle）アンケートの survey id 解決（deep-link 用）
 *
 * `kind='playstyle'` の skill-survey を1件特定し、その id を返す（Req 6.1）。
 * 気質CTAの deep-link（`/skill-survey/[surveyId]`）が UUID を必要とするため、seed で
 * 投入された playstyle survey の id をここで解決する。未投入時は null を返し、呼び手は
 * アンケート一覧 `/skill-survey` へフォールバックする（機能低下せず）。
 *
 * 依存方向: packages/db は apps/* / packages/ai を import しない。skill-survey schema
 *   （P0）のみに依存する。
 */

import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';

/**
 * 気質（playstyle）survey の id を1件返す。
 *
 * seed（jobType='playstyle' / kind='playstyle'）で1件だけ投入される想定。
 * kind でフィルタして survey を特定する（jobType 文字列にはハードコード依存しない）。
 *
 * @returns seed 済みなら playstyle survey の id、無ければ null。
 */
export async function getPlaystyleSurveyId(): Promise<string | null> {
  const rows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'playstyle'))
    .limit(1);

  return rows[0]?.id ?? null;
}

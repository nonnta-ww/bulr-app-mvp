/**
 * get-thinking-style-survey-id — 思考スタイル（thinking_style）アンケートの survey id 解決（deep-link 用）
 *
 * `kind='thinking_style'` の skill-survey を1件特定し、その id を返す（Req 6.1）。
 * 思考スタイル診断CTAの deep-link（`/skill-survey/[surveyId]`）が UUID を必要とするため、
 * seed で投入された thinking_style survey の id をここで解決する。未投入時は null を返し、
 * 呼び手はアンケート一覧 `/skill-survey` へフォールバックする（機能低下せず）。
 *
 * 依存方向: packages/db は apps/* / packages/ai を import しない。skill-survey schema
 *   のみに依存する。
 */

import { eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';

/**
 * 思考スタイル（thinking_style）survey の id を1件返す。
 *
 * seed（kind='thinking_style'）で1件だけ投入される想定。
 * kind でフィルタして survey を特定する（jobType 文字列にはハードコード依存しない）。
 *
 * @returns seed 済みなら thinking_style survey の id、無ければ null。
 */
export async function getThinkingStyleSurveyId(): Promise<string | null> {
  const rows = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'thinking_style'))
    .limit(1);

  return rows[0]?.id ?? null;
}

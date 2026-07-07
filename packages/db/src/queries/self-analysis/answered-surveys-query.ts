/**
 * 候補者が回答済みのアンケート一覧を、最新回答日・分析ステータス付きで返す。
 * /self-analysis 一覧ページのデータソース（複数アンケート種別対応）。
 *
 * skill_survey 系・self_analysis を read-only で参照する。
 */

import { and, desc, eq, max } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';
import { skillSurveyResponse } from '../../schema/skill-survey-response';
import { selfAnalysis } from '../../schema/self-analysis';

/** 一覧カード1件分のサマリ */
export interface AnsweredSurveySummary {
  surveyId: string;
  jobType: string;
  title: string;
  latestSubmittedAt: Date;
  /** none: 分析なし / ready: 最新の分析あり / stale: 回答更新あり */
  analysisStatus: 'none' | 'ready' | 'stale';
}

/**
 * 候補者の回答済みアンケートを surveyId 単位で集約して返す（最新回答日 降順）。
 * 本人 ID で限定。未回答の場合は空配列。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID（本人のみ）
 */
export async function getAnsweredSurveysForCandidate(
  candidateProfileId: string,
): Promise<AnsweredSurveySummary[]> {
  // Step 1: surveyId ごとの最新回答日を集約し、title / jobType を JOIN で解決
  const answered = await db
    .select({
      surveyId: skillSurveyResponse.skillSurveyId,
      title: skillSurvey.title,
      jobType: skillSurvey.jobType,
      latestSubmittedAt: max(skillSurveyResponse.submittedAt),
    })
    .from(skillSurveyResponse)
    .innerJoin(skillSurvey, eq(skillSurveyResponse.skillSurveyId, skillSurvey.id))
    // playstyle アンケートは職種アンケート一覧・自己分析生成対象から除外する
    // （rpg-class-diagnosis R1.1: playstyle は診断専用で self-analysis には載せない）
    .where(
      and(
        eq(skillSurveyResponse.candidateProfileId, candidateProfileId),
        eq(skillSurvey.kind, 'skill'),
      ),
    )
    .groupBy(skillSurveyResponse.skillSurveyId, skillSurvey.title, skillSurvey.jobType);

  if (answered.length === 0) {
    return [];
  }

  // Step 2: 各 survey の最新 self_analysis.sourceSubmittedAt を解決してステータス導出
  const summaries: AnsweredSurveySummary[] = [];
  for (const row of answered) {
    const latestSubmittedAt = row.latestSubmittedAt as Date;

    const analysisRows = await db
      .select({ sourceSubmittedAt: selfAnalysis.sourceSubmittedAt })
      .from(selfAnalysis)
      .where(
        and(
          eq(selfAnalysis.candidateProfileId, candidateProfileId),
          eq(selfAnalysis.skillSurveyId, row.surveyId),
        ),
      )
      .orderBy(desc(selfAnalysis.sourceSubmittedAt))
      .limit(1);

    const sourceSubmittedAt = analysisRows[0]?.sourceSubmittedAt ?? null;

    const analysisStatus: AnsweredSurveySummary['analysisStatus'] =
      sourceSubmittedAt === null
        ? 'none'
        : latestSubmittedAt > sourceSubmittedAt
          ? 'stale'
          : 'ready';

    summaries.push({
      surveyId: row.surveyId,
      jobType: row.jobType,
      title: row.title,
      latestSubmittedAt,
      analysisStatus,
    });
  }

  // Step 3: 最新回答日 降順で返す
  summaries.sort((a, b) => b.latestSubmittedAt.getTime() - a.latestSubmittedAt.getTime());

  return summaries;
}

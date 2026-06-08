import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurveyAnswer, skillSurveyResponse } from '../../schema/skill-survey-response';
import { skillSurveyQuestion } from '../../schema/skill-survey';

// --- Types ---

export type SkillSurveyResponseWithAnswers = {
  response: typeof skillSurveyResponse.$inferSelect;
  answers: Array<{
    answer: typeof skillSurveyAnswer.$inferSelect;
    question: typeof skillSurveyQuestion.$inferSelect;
  }>;
};

// --- Queries ---

/**
 * 指定した (candidateProfileId, surveyId) ペアに紐づく最新回答セットを返す。
 * append-only 移行後は複数版が存在しうるため、submitted_at 降順で最新版を取得する。
 * 存在しない場合は null を返す。
 */
export async function getLatestResponseByCandidateProfileId(
  candidateProfileId: string,
  surveyId: string,
): Promise<SkillSurveyResponseWithAnswers | null> {
  // Step 1: (candidateProfileId, surveyId) で submitted_at 降順の最新レスポンスを 1 件取得
  // append-only 後は複数版が存在するため、ORDER BY submitted_at DESC で最新版を保証する
  const responseRows = await db
    .select()
    .from(skillSurveyResponse)
    .where(
      and(
        eq(skillSurveyResponse.candidateProfileId, candidateProfileId),
        eq(skillSurveyResponse.skillSurveyId, surveyId),
      ),
    )
    .orderBy(desc(skillSurveyResponse.submittedAt))
    .limit(1);

  const matchedResponse = responseRows[0];

  if (!matchedResponse) {
    return null;
  }

  // Step 2: レスポンスに紐づく回答と質問を JOIN で取得
  const answerRows = await db
    .select()
    .from(skillSurveyAnswer)
    .innerJoin(
      skillSurveyQuestion,
      eq(skillSurveyAnswer.questionId, skillSurveyQuestion.id),
    )
    .where(eq(skillSurveyAnswer.responseId, matchedResponse.id))
    .orderBy(asc(skillSurveyQuestion.displayOrder));

  return {
    response: matchedResponse,
    answers: answerRows.map((row) => ({
      answer: row.skill_survey_answer,
      question: row.skill_survey_question,
    })),
  };
}

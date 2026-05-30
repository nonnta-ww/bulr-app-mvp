import { and, asc, eq } from 'drizzle-orm';

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
 * 指定した (candidateProfileId, surveyId) ペアに紐づく回答セットを返す。
 * DB ユニーク制約により該当ペアは最大 1 件。存在しない場合は null を返す。
 */
export async function getLatestResponseByCandidateProfileId(
  candidateProfileId: string,
  surveyId: string,
): Promise<SkillSurveyResponseWithAnswers | null> {
  // Step 1: (candidateProfileId, surveyId) でレスポンスを 1 件取得
  // DB ユニーク制約により最大 1 件しか存在しない
  const responseRows = await db
    .select()
    .from(skillSurveyResponse)
    .where(
      and(
        eq(skillSurveyResponse.candidateProfileId, candidateProfileId),
        eq(skillSurveyResponse.skillSurveyId, surveyId),
      ),
    )
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

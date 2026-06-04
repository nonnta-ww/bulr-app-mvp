/**
 * 自己分析用 skill-survey 読み出しクエリ
 *
 * skill_survey 系テーブルを read-only で参照し、候補者の最新回答を
 * カテゴリ名・選択肢ラベル付きで束ねて返す。
 * skill_survey テーブルへの INSERT/UPDATE/DELETE は一切行わない。
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../../client';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyChoice,
  skillSurveyQuestion,
} from '../../schema/skill-survey';
import { skillSurveyAnswer, skillSurveyResponse } from '../../schema/skill-survey-response';

// ---------------------------------------------------------------------------
// 出力型定義
// ---------------------------------------------------------------------------

/** 設問ごとの回答（カテゴリ名・選択肢ラベル解決済み） */
export interface AnswerForAnalysis {
  questionId: string;
  categoryName: string;
  questionBody: string;
  questionType: 'single_choice' | 'multi_choice' | 'free_text';
  /** selected_choice_ids を label に解決した配列 */
  selectedLabels: string[];
  freeText: string | null;
}

/** カテゴリ別回答グループ */
export interface SurveyResponseForAnalysis {
  surveyId: string;
  jobType: string;
  responseId: string;
  submittedAt: Date;
  categories: Array<{
    categoryName: string;
    /** マスタ上のそのカテゴリの設問総数 */
    totalQuestions: number;
    answers: AnswerForAnalysis[];
  }>;
}

// ---------------------------------------------------------------------------
// クエリ実装
// ---------------------------------------------------------------------------

/**
 * 候補者が回答済みの survey を1件特定する。
 * 複数回答時は最新 submittedAt の survey を返す（job_type は 1 survey につき 1 つ）。
 * 未回答の場合は null を返す。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID（本人のみ）
 */
export async function getAnsweredSurveyForCandidate(
  candidateProfileId: string,
): Promise<{ surveyId: string; jobType: string; submittedAt: Date } | null> {
  // skill_survey_response と skill_survey を JOIN し、最新 submittedAt の 1 件を取得
  const rows = await db
    .select({
      surveyId: skillSurveyResponse.skillSurveyId,
      jobType: skillSurvey.jobType,
      submittedAt: skillSurveyResponse.submittedAt,
    })
    .from(skillSurveyResponse)
    .innerJoin(skillSurvey, eq(skillSurveyResponse.skillSurveyId, skillSurvey.id))
    .where(eq(skillSurveyResponse.candidateProfileId, candidateProfileId))
    .orderBy(desc(skillSurveyResponse.submittedAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    surveyId: row.surveyId,
    jobType: row.jobType,
    submittedAt: row.submittedAt,
  };
}

/**
 * 候補者の指定 survey に対する最新回答を、カテゴリ名・選択肢ラベル付きで返す。
 * candidateProfileId でフィルタし当該候補者のデータのみを返す（Req 7.2）。
 * 未回答（または他候補者の回答）の場合は null を返す。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID
 * @param surveyId           - 対象 skill_survey の ID
 */
export async function getSurveyResponseForAnalysis(
  candidateProfileId: string,
  surveyId: string,
): Promise<SurveyResponseForAnalysis | null> {
  // Step 1: (candidateProfileId, surveyId) で response を取得（DB UNIQUE 制約により最大 1 件）
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

  const response = responseRows[0];
  if (!response) {
    return null;
  }

  // Step 2: survey の jobType を取得
  const surveyRows = await db
    .select({ jobType: skillSurvey.jobType })
    .from(skillSurvey)
    .where(eq(skillSurvey.id, surveyId))
    .limit(1);

  const survey = surveyRows[0];
  if (!survey) {
    return null;
  }

  // Step 3: survey に属するカテゴリを displayOrder 順に取得
  const categories = await db
    .select()
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId))
    .orderBy(asc(skillSurveyCategory.displayOrder));

  if (categories.length === 0) {
    return {
      surveyId,
      jobType: survey.jobType,
      responseId: response.id,
      submittedAt: response.submittedAt,
      categories: [],
    };
  }

  const categoryIds = categories.map((c) => c.id);

  // Step 4: 各カテゴリの設問を displayOrder 順に取得（totalQuestions 算出用）
  const questions = await db
    .select()
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, categoryIds))
    .orderBy(asc(skillSurveyQuestion.displayOrder));

  const questionIds = questions.map((q) => q.id);

  // Step 5: response に紐づく回答を取得
  const answers =
    questionIds.length > 0
      ? await db
          .select()
          .from(skillSurveyAnswer)
          .where(
            and(
              eq(skillSurveyAnswer.responseId, response.id),
              inArray(skillSurveyAnswer.questionId, questionIds),
            ),
          )
      : [];

  // Step 6: 選択肢ラベルを一括解決（selected_choice_ids → label）
  // 全回答の selected_choice_ids を平坦化して unique な choice ID を収集
  const allSelectedChoiceIds = answers
    .flatMap((a) => a.selectedChoiceIds ?? [])
    .filter((id): id is string => id !== null && id !== undefined);

  const uniqueChoiceIds = [...new Set(allSelectedChoiceIds)];

  const choiceRows =
    uniqueChoiceIds.length > 0
      ? await db
          .select({ id: skillSurveyChoice.id, label: skillSurveyChoice.label })
          .from(skillSurveyChoice)
          .where(inArray(skillSurveyChoice.id, uniqueChoiceIds))
      : [];

  // choice ID → label のマップ
  const choiceLabelMap = new Map<string, string>(choiceRows.map((c) => [c.id, c.label]));

  // Step 7: カテゴリごとに答えを束ねる
  // question ID → answer のマップ
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  // category ID → question[] のマップ（displayOrder 順は既に保証済み）
  const questionsByCategory = new Map<string, typeof questions>();
  for (const question of questions) {
    const list = questionsByCategory.get(question.categoryId) ?? [];
    list.push(question);
    questionsByCategory.set(question.categoryId, list);
  }

  const resultCategories = categories.map((category) => {
    const categoryQuestions = questionsByCategory.get(category.id) ?? [];
    const totalQuestions = categoryQuestions.length;

    const categoryAnswers: AnswerForAnalysis[] = categoryQuestions.map((question) => {
      const answer = answerMap.get(question.id);
      const selectedChoiceIds = answer?.selectedChoiceIds ?? [];
      const selectedLabels = (selectedChoiceIds ?? []).flatMap((choiceId) => {
        const label = choiceLabelMap.get(choiceId);
        return label !== undefined ? [label] : [];
      });

      return {
        questionId: question.id,
        categoryName: category.name,
        questionBody: question.body,
        questionType: question.questionType,
        selectedLabels,
        freeText: answer?.freeText ?? null,
      };
    });

    return {
      categoryName: category.name,
      totalQuestions,
      answers: categoryAnswers,
    };
  });

  return {
    surveyId,
    jobType: survey.jobType,
    responseId: response.id,
    submittedAt: response.submittedAt,
    categories: resultCategories,
  };
}

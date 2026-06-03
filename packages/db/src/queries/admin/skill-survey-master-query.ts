import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '../../client';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyChoice,
  skillSurveyQuestion,
} from '../../schema/skill-survey';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export interface SkillSurveyTree {
  survey: { id: string; jobType: string; title: string; isActive: boolean };
  categories: Array<{
    id: string;
    name: string;
    subcategory: string | null;
    displayOrder: number;
    questions: Array<{
      id: string;
      body: string;
      questionType: string;
      displayOrder: number;
      choices: Array<{ id: string; label: string; displayOrder: number }>;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// getSkillSurveyList
// ---------------------------------------------------------------------------

/**
 * 管理者向けスキルアンケート一覧クエリ。
 *
 * skill_survey テーブルの全件を返す（id・jobType・title・isActive）。
 * 下流タスク 4.2（index.ts re-export）・12.2（一覧ページ）が消費する。
 */
export async function getSkillSurveyList(): Promise<
  Array<{ id: string; jobType: string; title: string; isActive: boolean }>
> {
  const rows = await db
    .select({
      id: skillSurvey.id,
      jobType: skillSurvey.jobType,
      title: skillSurvey.title,
      isActive: skillSurvey.isActive,
    })
    .from(skillSurvey)
    .orderBy(asc(skillSurvey.jobType));

  return rows.map((row) => ({
    id: row.id,
    jobType: row.jobType,
    title: row.title,
    isActive: row.isActive,
  }));
}

// ---------------------------------------------------------------------------
// getSkillSurveyMaster
// ---------------------------------------------------------------------------

/**
 * 管理者向けスキルアンケートマスタ（ツリー構造）クエリ。
 *
 * survey → categories[] → questions[] → choices[] のネスト構造で返す。
 * 対象 survey が存在しない場合は undefined を返す。
 *
 * N+1 を回避するため、複数クエリで全 row を一括取得してアプリ側でネスト化する。
 *   1. survey 1 件取得
 *   2. その survey に紐づく全 category を一括取得
 *   3. categoryId 一覧で全 question を一括取得
 *   4. questionId 一覧で全 choice を一括取得
 */
export async function getSkillSurveyMaster(
  surveyId: string,
): Promise<SkillSurveyTree | undefined> {
  // ------------------------------------------------------------------
  // 1. survey 基本情報
  // ------------------------------------------------------------------
  const surveyRows = await db
    .select({
      id: skillSurvey.id,
      jobType: skillSurvey.jobType,
      title: skillSurvey.title,
      isActive: skillSurvey.isActive,
    })
    .from(skillSurvey)
    .where(eq(skillSurvey.id, surveyId))
    .limit(1);

  const survey = surveyRows[0];
  if (!survey) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // 2. カテゴリ一覧（survey に紐づく全件）
  // ------------------------------------------------------------------
  const categoryRows = await db
    .select({
      id: skillSurveyCategory.id,
      name: skillSurveyCategory.name,
      subcategory: skillSurveyCategory.subcategory,
      displayOrder: skillSurveyCategory.displayOrder,
    })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId))
    .orderBy(asc(skillSurveyCategory.displayOrder));

  if (categoryRows.length === 0) {
    return {
      survey: {
        id: survey.id,
        jobType: survey.jobType,
        title: survey.title,
        isActive: survey.isActive,
      },
      categories: [],
    };
  }

  const categoryIds = categoryRows.map((c) => c.id);

  // ------------------------------------------------------------------
  // 3. 設問一覧（全カテゴリ分を一括取得）
  // ------------------------------------------------------------------
  const questionRows = await db
    .select({
      id: skillSurveyQuestion.id,
      categoryId: skillSurveyQuestion.categoryId,
      body: skillSurveyQuestion.body,
      questionType: skillSurveyQuestion.questionType,
      displayOrder: skillSurveyQuestion.displayOrder,
    })
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, categoryIds))
    .orderBy(asc(skillSurveyQuestion.displayOrder));

  // ------------------------------------------------------------------
  // 4. 選択肢一覧（全設問分を一括取得）
  // ------------------------------------------------------------------
  const choiceRows: Array<{
    id: string;
    questionId: string;
    label: string;
    displayOrder: number;
  }> = [];

  if (questionRows.length > 0) {
    const questionIds = questionRows.map((q) => q.id);

    const fetchedChoices = await db
      .select({
        id: skillSurveyChoice.id,
        questionId: skillSurveyChoice.questionId,
        label: skillSurveyChoice.label,
        displayOrder: skillSurveyChoice.displayOrder,
      })
      .from(skillSurveyChoice)
      .where(inArray(skillSurveyChoice.questionId, questionIds))
      .orderBy(asc(skillSurveyChoice.displayOrder));

    choiceRows.push(...fetchedChoices);
  }

  // ------------------------------------------------------------------
  // 5. アプリ側でネスト構造に変換
  // ------------------------------------------------------------------

  // questionId → choices[] マップ
  const choicesByQuestionId = new Map<
    string,
    Array<{ id: string; label: string; displayOrder: number }>
  >();
  for (const choice of choiceRows) {
    const bucket = choicesByQuestionId.get(choice.questionId);
    if (bucket !== undefined) {
      bucket.push({ id: choice.id, label: choice.label, displayOrder: choice.displayOrder });
    } else {
      choicesByQuestionId.set(choice.questionId, [
        { id: choice.id, label: choice.label, displayOrder: choice.displayOrder },
      ]);
    }
  }

  // categoryId → questions[] マップ
  const questionsByCategoryId = new Map<
    string,
    Array<{
      id: string;
      body: string;
      questionType: string;
      displayOrder: number;
      choices: Array<{ id: string; label: string; displayOrder: number }>;
    }>
  >();
  for (const question of questionRows) {
    const choices = choicesByQuestionId.get(question.id) ?? [];
    const questionItem = {
      id: question.id,
      body: question.body,
      questionType: question.questionType,
      displayOrder: question.displayOrder,
      choices,
    };
    const bucket = questionsByCategoryId.get(question.categoryId);
    if (bucket !== undefined) {
      bucket.push(questionItem);
    } else {
      questionsByCategoryId.set(question.categoryId, [questionItem]);
    }
  }

  // カテゴリ配列にネストされた設問・選択肢を組み込む
  const categories = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    subcategory: category.subcategory ?? null,
    displayOrder: category.displayOrder,
    questions: questionsByCategoryId.get(category.id) ?? [],
  }));

  return {
    survey: {
      id: survey.id,
      jobType: survey.jobType,
      title: survey.title,
      isActive: survey.isActive,
    },
    categories,
  };
}

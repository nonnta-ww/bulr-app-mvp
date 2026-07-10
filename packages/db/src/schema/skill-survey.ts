/**
 * skill_survey マスタテーブル定義
 *
 * スキルアンケート 4 階層マスタ（survey → category → question → choice）。
 * 職種（job_type）ごとに 1 つの survey を持ち、候補者が回答する静的な
 * 構造化フォームのテンプレートを格納する。
 */

import { boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

// --- Enum ---

export const questionType = pgEnum('question_type', [
  'single_choice',
  'multi_choice',
  'free_text',
]);

export const scoreKind = pgEnum('score_kind', ['proficiency', 'recency', 'frequency', 'polarity']);

export const surveyKind = pgEnum('survey_kind', [
  'skill',
  'playstyle',
  'thinking_style',
  'worklife_disposition',
]);

// --- Tables ---

export const skillSurvey = pgTable('skill_survey', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  jobType: text('job_type').notNull().unique(),
  kind: surveyKind('kind').notNull().default('skill'),
  title: text('title').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skillSurveyCategory = pgTable(
  'skill_survey_category',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    skillSurveyId: text('skill_survey_id')
      .notNull()
      .references(() => skillSurvey.id),
    name: text('name').notNull(),
    subcategory: text('subcategory'),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSkillSurveyCategoryName: uniqueIndex('skill_survey_category_survey_name_sub_idx').on(
      t.skillSurveyId,
      t.name,
      t.subcategory,
    ),
  }),
);

export const skillSurveyQuestion = pgTable(
  'skill_survey_question',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    categoryId: text('category_id')
      .notNull()
      .references(() => skillSurveyCategory.id),
    body: text('body').notNull(),
    questionType: questionType('question_type').notNull(),
    scoringKind: scoreKind('scoring_kind'),
    isRequired: boolean('is_required').notNull().default(false),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSkillSurveyQuestionBody: uniqueIndex('skill_survey_question_category_body_idx').on(
      t.categoryId,
      t.body,
    ),
  }),
);

export const skillSurveyChoice = pgTable(
  'skill_survey_choice',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    questionId: text('question_id')
      .notNull()
      .references(() => skillSurveyQuestion.id),
    label: text('label').notNull(),
    level: integer('level'),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSkillSurveyChoiceLabel: uniqueIndex('skill_survey_choice_question_label_idx').on(
      t.questionId,
      t.label,
    ),
  }),
);

// --- Types ---

export type SkillSurvey = typeof skillSurvey.$inferSelect;
export type NewSkillSurvey = typeof skillSurvey.$inferInsert;

export type SkillSurveyCategory = typeof skillSurveyCategory.$inferSelect;
export type NewSkillSurveyCategory = typeof skillSurveyCategory.$inferInsert;

export type SkillSurveyQuestion = typeof skillSurveyQuestion.$inferSelect;
export type NewSkillSurveyQuestion = typeof skillSurveyQuestion.$inferInsert;

export type SkillSurveyChoice = typeof skillSurveyChoice.$inferSelect;
export type NewSkillSurveyChoice = typeof skillSurveyChoice.$inferInsert;

// QuestionType は pgEnum から派生（DRY 原則: enum 値の単一の真実を pgEnum 側に置く）
// packages/db のバレルで再 export し、後続 spec は `import type { QuestionType } from '@bulr/db'` する
export type QuestionType = (typeof questionType.enumValues)[number];

// ScoreKind は scoreKind pgEnum から派生
export type ScoreKind = (typeof scoreKind.enumValues)[number];

// SurveyKind は surveyKind pgEnum から派生
export type SurveyKind = (typeof surveyKind.enumValues)[number];

/**
 * skill_survey_response / skill_survey_answer テーブル定義
 *
 * 候補者がスキルアンケートに回答した結果を格納する。
 * 追記型（append-only）。再回答ごとに行が追加され、過去の回答は上書きされない。
 * answer は response に紐づき、response 削除時は CASCADE で削除される。
 */

import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { candidateProfile } from './candidate-profile';
import { skillSurvey, skillSurveyQuestion } from './skill-survey';

// --- Tables ---

export const skillSurveyResponse = pgTable(
  'skill_survey_response',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    candidateProfileId: text('candidate_profile_id')
      .notNull()
      .references(() => candidateProfile.id),
    skillSurveyId: text('skill_survey_id')
      .notNull()
      .references(() => skillSurvey.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('skill_survey_response_candidate_survey_submitted_idx').on(
      t.candidateProfileId,
      t.skillSurveyId,
      t.submittedAt,
    ),
  ],
);

export const skillSurveyAnswer = pgTable('skill_survey_answer', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  responseId: text('response_id')
    .notNull()
    .references(() => skillSurveyResponse.id, { onDelete: 'cascade' }),
  questionId: text('question_id')
    .notNull()
    .references(() => skillSurveyQuestion.id),
  selectedChoiceIds: text('selected_choice_ids').array(),
  freeText: text('free_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Types ---

export type SkillSurveyResponse = typeof skillSurveyResponse.$inferSelect;
export type NewSkillSurveyResponse = typeof skillSurveyResponse.$inferInsert;

export type SkillSurveyAnswer = typeof skillSurveyAnswer.$inferSelect;
export type NewSkillSurveyAnswer = typeof skillSurveyAnswer.$inferInsert;

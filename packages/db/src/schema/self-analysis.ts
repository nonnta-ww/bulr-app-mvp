/**
 * self_analysis テーブル定義
 *
 * 候補者の skill-survey 回答から生成した自己分析を永続化する。
 * 1 回答版あたり 1 件（source_response_id 一意で保証）。版管理（追記型）。
 * candidate_profile 削除時は CASCADE で削除される。
 */

import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { candidateProfile } from './candidate-profile';
import { skillSurvey } from './skill-survey';
import { skillSurveyResponse } from './skill-survey-response';

// ---------------------------------------------------------------------------
// JSON 列の型定義
// ---------------------------------------------------------------------------

/** カテゴリ別カバレッジ（決定論的集計の単位） */
export interface CategoryCoverage {
  categoryName: string;
  answeredQuestions: number;
  totalQuestions: number;
  coverageRatio: number; // answered/total（0..1）
  selectedBreadth: number; // 選択肢選択の総数
  freeTextPresence: boolean; // 自由記述の有無
  // --- proficiency-scale で追加（すべて optional / 旧スナップショットでは欠落） ---
  proficiencyScore?: number | null; // 0..100。proficiency 回答が無ければ null（Req 5.1, 5.4）
  answeredProficiencyCount?: number; // 熟練度に寄与した設問数
  recencyOrdinal?: number | null; // recency 設問の level 序数（無ければ null, Req 5.3）
  recencyLabel?: string | null; // 表示用ラベル（例: 現在も利用中）
  // --- ai-driven-development-survey で追加（すべて optional / 旧スナップショットでは欠落） ---
  frequencyScore?: number | null; // 0..100。frequency 回答が無ければ null（Req 4.2）
  answeredFrequencyCount?: number; // 頻度に寄与した設問数
}

/**
 * 決定論的集計スナップショット（aggregated_snapshot 列に格納）
 * 同一入力→同一出力が保証される純関数の出力形式（Req 2.2）
 */
export interface AggregatedSnapshot {
  jobType: string;
  overallCoverageRatio: number;
  categories: CategoryCoverage[];
}

/**
 * 自然言語サマリ（llm_output 列に格納）
 * 強み・弱み・成長アクション（Req 3.x）
 */
export interface SelfAnalysisNarrative {
  strengths: string[];
  weaknesses: string[];
  growthActions: string[];
}

/**
 * 自己分析メタデータ（metadata 列に格納）
 * LLM コスト推定（admin-operations と形式整合 Req 9.1/9.2）
 */
export interface SelfAnalysisMetadata {
  llm_cost_estimate: {
    input_tokens: number;
    output_tokens: number;
    estimated_usd: number;
  };
}

// ---------------------------------------------------------------------------
// テーブル定義
// ---------------------------------------------------------------------------

export const selfAnalysis = pgTable(
  'self_analysis',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    candidateProfileId: text('candidate_profile_id')
      .notNull()
      .references(() => candidateProfile.id, { onDelete: 'cascade' }),
    skillSurveyId: text('skill_survey_id')
      .notNull()
      .references(() => skillSurvey.id),
    sourceResponseId: text('source_response_id')
      .notNull()
      .references(() => skillSurveyResponse.id),
    sourceSubmittedAt: timestamp('source_submitted_at', { withTimezone: true }).notNull(),
    aggregatedSnapshot: jsonb('aggregated_snapshot')
      .$type<AggregatedSnapshot>()
      .notNull(),
    llmOutput: jsonb('llm_output').$type<SelfAnalysisNarrative>(),
    metadata: jsonb('metadata').$type<SelfAnalysisMetadata>(),
    regenerationCount: integer('regeneration_count').notNull().default(0),
    regenerationWindowStart: timestamp('regeneration_window_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('self_analysis_source_response_idx').on(table.sourceResponseId),
    index('self_analysis_candidate_survey_submitted_idx').on(
      table.candidateProfileId,
      table.skillSurveyId,
      table.sourceSubmittedAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 型エクスポート
// ---------------------------------------------------------------------------

export type SelfAnalysis = typeof selfAnalysis.$inferSelect;
export type NewSelfAnalysis = typeof selfAnalysis.$inferInsert;

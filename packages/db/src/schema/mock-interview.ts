import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { candidateProfile } from './candidate-profile';

/** 5 次元形成的フィードバック */
export interface FormativeFeedback {
  authenticity: string; // 真贋
  judgment: string; // 判断力
  scope: string; // 射程
  meta_cognition: string; // メタ認知
  ai_literacy: string; // AI 活用リテラシー
  overall: string; // 総合所感
}

/** LLM コスト推定 */
export interface MockInterviewMetadata {
  llm_cost_estimate: {
    input_tokens: number;
    output_tokens: number;
    estimated_usd: number;
  };
}

export const mockInterview = pgTable(
  'mock_interview',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    candidateProfileId: text('candidate_profile_id')
      .notNull()
      .references(() => candidateProfile.id, { onDelete: 'cascade' }),
    patternCode: text('pattern_code').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    turnCount: integer('turn_count').notNull().default(0),
    formativeFeedback: jsonb('formative_feedback').$type<FormativeFeedback>(),
    metadata: jsonb('metadata').$type<MockInterviewMetadata>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('mock_interview_candidate_profile_id_idx').on(table.candidateProfileId),
    index('mock_interview_created_at_idx').on(table.createdAt),
  ],
);

export type MockInterview = typeof mockInterview.$inferSelect;
export type NewMockInterview = typeof mockInterview.$inferInsert;

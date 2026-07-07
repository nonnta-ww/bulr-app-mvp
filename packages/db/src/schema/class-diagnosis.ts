/**
 * class_diagnosis テーブル定義
 *
 * 候補者を「RPGのクラス」として診断した確定結果を永続化する。
 * 職掌は全 skill-survey 回答から横断合成し、気質は playstyle 診断から導く。
 * 1候補者に複数版（append-only）。版一意キーは (candidate_profile_id, source_signature)。
 * candidate_profile 削除時は CASCADE で削除される。
 *
 * jsonb 列の型契約（ClassResult / ClassFlavor / ClassDiagnosisSourceSnapshot /
 * ClassDiagnosisMetadata）は最下層 `@bulr/types` に置く（依存方向 types → db → ai → apps）。
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import type {
  ClassDiagnosisMetadata,
  ClassDiagnosisSourceSnapshot,
  ClassFlavor,
  ClassResult,
} from '@bulr/types/class-diagnosis';

import { candidateProfile } from './candidate-profile';

// ---------------------------------------------------------------------------
// テーブル定義
// ---------------------------------------------------------------------------

export const classDiagnosis = pgTable(
  'class_diagnosis',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    candidateProfileId: text('candidate_profile_id')
      .notNull()
      .references(() => candidateProfile.id, { onDelete: 'cascade' }),
    sourceSignature: text('source_signature').notNull(),
    sourceSnapshot: jsonb('source_snapshot')
      .$type<ClassDiagnosisSourceSnapshot>()
      .notNull(),
    result: jsonb('result').$type<ClassResult>().notNull(),
    llmFlavor: jsonb('llm_flavor').$type<ClassFlavor>(), // nullable = LLM失敗（R7.3）
    metadata: jsonb('metadata').$type<ClassDiagnosisMetadata>(),
    regenerationCount: integer('regeneration_count').notNull().default(0),
    regenerationWindowStart: timestamp('regeneration_window_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('class_diagnosis_candidate_signature_idx').on(
      table.candidateProfileId,
      table.sourceSignature,
    ),
    index('class_diagnosis_candidate_generated_idx').on(
      table.candidateProfileId,
      table.generatedAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 型エクスポート
// ---------------------------------------------------------------------------

export type ClassDiagnosis = typeof classDiagnosis.$inferSelect;
export type NewClassDiagnosis = typeof classDiagnosis.$inferInsert;

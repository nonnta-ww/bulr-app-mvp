import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import type { LlmEvaluation, ManualEvaluation } from '@bulr/types/evaluation';

import { interviewSession } from './interview-session';
import { assessmentPattern } from './assessment-pattern';

export const stuckType = pgEnum('stuck_type', [
  'not_experienced',
  'shallow',
  'single_option',
  'rigid',
]);

export const patternCoverage = pgTable(
  'pattern_coverage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    session_id: text('session_id')
      .notNull()
      .references(() => interviewSession.id),
    pattern_id: text('pattern_id')
      .notNull()
      .references(() => assessmentPattern.id),
    level_reached: integer('level_reached').notNull(),
    stuck_type: stuckType('stuck_type'),
    llm_evaluation: jsonb('llm_evaluation').$type<LlmEvaluation>().notNull(),
    manual_evaluation: jsonb('manual_evaluation').$type<ManualEvaluation>(),
    turn_ids: text('turn_ids').array().notNull(),
    finalized_at: timestamp('finalized_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pattern_coverage_session_pattern_unique').on(t.session_id, t.pattern_id),
  ]
);

export type PatternCoverage = typeof patternCoverage.$inferSelect;
export type NewPatternCoverage = typeof patternCoverage.$inferInsert;

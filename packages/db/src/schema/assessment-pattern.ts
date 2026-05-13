import { boolean, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const patternCategory = pgEnum('pattern_category', [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
]);

export const assessmentPattern = pgTable('assessment_pattern', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  code: text('code').notNull().unique(),
  category: patternCategory('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  expected_scope_min: integer('expected_scope_min').notNull(),
  expected_scope_max: integer('expected_scope_max').notNull(),
  level_1_intro: text('level_1_intro').notNull(),
  level_2_focus: text('level_2_focus').notNull(),
  level_3_focus: text('level_3_focus').notNull(),
  level_4_focus: text('level_4_focus').notNull(),
  signals: text('signals').array().notNull(),
  ai_perspective: text('ai_perspective').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AssessmentPattern = typeof assessmentPattern.$inferSelect;
export type NewAssessmentPattern = typeof assessmentPattern.$inferInsert;

// PatternCategory は pgEnum から派生 (DRY 原則: enum 値の単一の真実を pgEnum 側に置く)
// packages/db/src/index.ts のバレルで再 export し、後続 spec は `import type { PatternCategory } from '@bulr/db'` する
export type PatternCategory = (typeof patternCategory.enumValues)[number];

/**
 * 管理画面 手動評価入力の Zod スキーマ定義
 *
 * Requirements: 5.6, 6.3, 6.11
 * Boundary: ManualEvaluationSchema
 */

import { z } from 'zod';
import type { StuckType } from '@bulr/types/evaluation';

// StuckType の列挙値を inline で定義（型インポートのみのため）
const stuckTypeValues = ['not_experienced', 'shallow', 'single_option', 'rigid'] as const satisfies readonly StuckType[];

export const manualEvaluationSchema = z.object({
  patternCoverageId: z.string().min(1),
  authenticity: z.number().int().min(0).max(3),
  judgment: z.number().int().min(0).max(3),
  scope: z.number().int().min(1).max(5),
  meta_cognition: z.number().int().min(0).max(3),
  ai_literacy: z.number().int().min(0).max(3),
  level_reached: z.number().int().min(0).max(4),
  stuck_type: z.union([z.enum(stuckTypeValues), z.null()]),
  notes: z.string().max(5000),
});

export type ManualEvaluationInput = z.infer<typeof manualEvaluationSchema>;

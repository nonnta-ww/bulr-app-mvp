'use server';

/**
 * 手動評価更新 Server Action
 *
 * セキュリティ: reviewer は ctx.email（サーバー側固定）を使用し、
 * フォーム入力から設定しない。
 *
 * Requirements: 6.1-6.11, 10.4, 13.4
 */

import { adminAction } from '@bulr/auth';
import { manualEvaluationSchema } from '../_lib/manual-evaluation-schema';
import { db } from '@bulr/db';
import { patternCoverage } from '@bulr/db/schema/pattern-coverage';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { ManualEvaluation } from '@bulr/types/evaluation';

export const updateManualEvaluation = adminAction(
  manualEvaluationSchema,
  async (input, ctx) => {
    // reviewer はサーバー側の認証情報から取得し、フォーム入力から設定しない（信頼境界）
    const manualEval: ManualEvaluation = {
      authenticity: input.authenticity as ManualEvaluation['authenticity'],
      judgment: input.judgment as ManualEvaluation['judgment'],
      scope: input.scope as ManualEvaluation['scope'],
      meta_cognition: input.meta_cognition as ManualEvaluation['meta_cognition'],
      ai_literacy: input.ai_literacy as ManualEvaluation['ai_literacy'],
      level_reached: input.level_reached as ManualEvaluation['level_reached'],
      stuck_type: input.stuck_type,
      notes: input.notes,
      reviewer: ctx.email,
      reviewed_at: new Date().toISOString(),
    };

    const updated = await db
      .update(patternCoverage)
      .set({ manual_evaluation: manualEval })
      .where(eq(patternCoverage.id, input.patternCoverageId))
      .returning({ sessionId: patternCoverage.session_id });

    const first = updated[0];
    if (!first) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    revalidatePath(`/admin/sessions/${first.sessionId}`);
    return { ok: true as const };
  },
);

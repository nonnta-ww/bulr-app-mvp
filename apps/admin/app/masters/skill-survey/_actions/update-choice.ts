'use server';

/**
 * スキルアンケート選択肢更新 Server Action
 *
 * Requirements: 3.3, 3.4, 3.5, 6.5
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import {
  skillSurveyCategory,
  skillSurveyChoice,
  skillSurveyQuestion,
} from '@bulr/db/schema/skill-survey';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const updateChoice = adminAction(
  z.object({
    choiceId: z.string().min(1),
    label: z.string().min(1).max(500),
    displayOrder: z.number().int().min(0),
  }),
  async (input) => {
    const updated = await db
      .update(skillSurveyChoice)
      .set({
        label: input.label,
        displayOrder: input.displayOrder,
      })
      .where(eq(skillSurveyChoice.id, input.choiceId))
      .returning({ questionId: skillSurveyChoice.questionId });

    const first = updated[0];
    if (!first) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    const question = await db
      .select({ categoryId: skillSurveyQuestion.categoryId })
      .from(skillSurveyQuestion)
      .where(eq(skillSurveyQuestion.id, first.questionId))
      .limit(1);

    const q = question[0];
    if (!q) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    const category = await db
      .select({ skillSurveyId: skillSurveyCategory.skillSurveyId })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.id, q.categoryId))
      .limit(1);

    const cat = category[0];
    if (!cat) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    revalidatePath(`/masters/skill-survey/${cat.skillSurveyId}`);
    return { ok: true as const };
  },
);

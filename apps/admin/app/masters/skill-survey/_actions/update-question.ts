'use server';

/**
 * スキルアンケート設問更新 Server Action
 *
 * Requirements: 3.3, 3.4, 3.5, 6.5
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { skillSurveyCategory, skillSurveyQuestion } from '@bulr/db/schema/skill-survey';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const updateQuestion = adminAction(
  z.object({
    questionId: z.string().min(1),
    body: z.string().min(1).max(1000),
    questionType: z.enum(['single_choice', 'multi_choice', 'free_text']),
    displayOrder: z.number().int().min(0),
  }),
  async (input) => {
    const updated = await db
      .update(skillSurveyQuestion)
      .set({
        body: input.body,
        questionType: input.questionType,
        displayOrder: input.displayOrder,
        updatedAt: new Date(),
      })
      .where(eq(skillSurveyQuestion.id, input.questionId))
      .returning({ categoryId: skillSurveyQuestion.categoryId });

    const first = updated[0];
    if (!first) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    const category = await db
      .select({ skillSurveyId: skillSurveyCategory.skillSurveyId })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.id, first.categoryId))
      .limit(1);

    const cat = category[0];
    if (!cat) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    revalidatePath(`/masters/skill-survey/${cat.skillSurveyId}`);
    return { ok: true as const };
  },
);

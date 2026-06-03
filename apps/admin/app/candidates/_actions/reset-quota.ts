'use server';

/**
 * 候補者クォータリセット Server Action
 *
 * quota_reset_at を現在時刻で更新する。mock_interview 行は削除しない。
 *
 * Requirements: 1.4, 1.5, 1.6, 6.5
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const resetQuota = adminAction(
  z.object({ candidateProfileId: z.string().min(1) }),
  async (input) => {
    const updated = await db
      .update(candidateProfile)
      .set({ quotaResetAt: new Date() })
      .where(eq(candidateProfile.id, input.candidateProfileId))
      .returning({ id: candidateProfile.id });

    const first = updated[0];
    if (!first) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    revalidatePath(`/candidates/${input.candidateProfileId}`);
    revalidatePath('/monitoring/quota');
    return { ok: true as const };
  },
);

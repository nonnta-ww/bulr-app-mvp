'use server';

/**
 * 候補者無効化 Server Action
 *
 * Requirements: 1.4, 1.5, 1.6, 6.2
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const disableCandidate = adminAction(
  z.object({ candidateProfileId: z.string().min(1) }),
  async (input) => {
    const updated = await db
      .update(candidateProfile)
      .set({ isActive: false })
      .where(eq(candidateProfile.id, input.candidateProfileId))
      .returning({ id: candidateProfile.id });

    const first = updated[0];
    if (!first) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    revalidatePath('/candidates');
    revalidatePath(`/candidates/${input.candidateProfileId}`);
    return { ok: true as const };
  },
);

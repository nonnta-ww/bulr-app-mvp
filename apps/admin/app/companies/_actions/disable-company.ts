'use server';

/**
 * 企業無効化 Server Action
 *
 * Requirements: 2.4, 2.5, 2.6, 6.5
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { company } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const disableCompany = adminAction(
  z.object({ companyId: z.string().min(1) }),
  async (input) => {
    const updated = await db
      .update(company)
      .set({ isActive: false })
      .where(eq(company.id, input.companyId))
      .returning({ id: company.id });

    const first = updated[0];
    if (!first) {
      return { ok: false as const, error: 'NOT_FOUND' as const };
    }

    revalidatePath('/companies');
    revalidatePath(`/companies/${input.companyId}`);
    return { ok: true as const };
  },
);

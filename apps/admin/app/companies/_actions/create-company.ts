'use server';

/**
 * 企業作成 Server Action
 *
 * Requirements: 2.4, 2.5, 2.6, 6.2
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { company } from '@bulr/db/schema';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export const createCompany = adminAction(
  z.object({ name: z.string().min(1).max(200) }),
  async (input) => {
    const [created] = await db
      .insert(company)
      .values({ name: input.name, isActive: true })
      .returning({ id: company.id });

    if (!created) {
      throw new Error('企業の作成に失敗しました');
    }

    redirect(`/companies/${created.id}`);
  },
);

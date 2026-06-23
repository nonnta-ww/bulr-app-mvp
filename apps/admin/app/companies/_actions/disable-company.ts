'use server';

/**
 * 企業無効化 Server Action（レガシー）
 *
 * Requirements: 2.4, 2.5, 2.6, 6.5
 *
 * NOTE: このアクションは task 5.1 で setCompanyStatus（company-user-invitation task 3.4）
 * に UI が移行される予定のレガシーアクション。
 * 移行前も `requireCompanyUser()` が company.status を参照するため（task 2.1）、
 * is_active=false の設定だけでは会社ゲートが機能しない。
 * そのため is_active=false に加えて status='suspended' を同期設定し、
 * 実際にメンバーのアクセスを停止させる（company-user-invitation task 3.4 修正）。
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { company } from '@bulr/db/schema';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const disableCompany = adminAction(
  z.object({ companyId: z.string().min(1) }),
  async (input) => {
    const updated = await db
      .update(company)
      .set({
        isActive: false,
        // status を suspended に同期: requireCompanyUser() は status で判定するため
        // is_active=false のみでは会社ゲートが機能しない（task 3.4 修正）。
        status: 'suspended',
        updatedAt: sql`now()`,
      })
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

'use server';

/**
 * removeCompanyMember — 企業メンバー解除 Server Action
 *
 * 管理者が会社メンバーを解除し、user_profile.company_id と role_in_org を NULL に戻す。
 * 既存データ（opening 等）はこの操作の影響を受けない（Req 3.4）。
 *
 * Requirements: 3.2, 3.4, 3.5, 6.1
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { userProfile } from '@bulr/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const removeCompanyMemberSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
});

export const removeCompanyMember = adminAction(
  removeCompanyMemberSchema,
  async ({ companyId, userId }) => {
    // -----------------------------------------------------------------------
    // 1. 条件付き UPDATE: company_id が一致するメンバーの company_id と role_in_org を NULL に設定する（Req 3.2）
    //    RETURNING で更新された行の userId を取得する。
    //
    //    NOTE: user_profile の company_id / role_in_org のみをクリアする。
    //    当該ユーザーが作成済みの opening 等の既存データは一切削除・変更しない（Req 3.4）。
    // -----------------------------------------------------------------------
    const updated = await db
      .update(userProfile)
      .set({
        companyId: null,
        roleInOrg: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(userProfile.userId, userId),
          eq(userProfile.companyId, companyId),
        ),
      )
      .returning({ userId: userProfile.userId });

    // -----------------------------------------------------------------------
    // 2. 更新行が返った場合 → 解除成功
    // -----------------------------------------------------------------------
    if (updated.length > 0) {
      revalidatePath(`/companies/${companyId}`);
      return { ok: true as const, data: { ok: true as const } };
    }

    // -----------------------------------------------------------------------
    // 3. 更新行なし → 指定 userId の user_profile が存在しないか、
    //    company_id が companyId と一致しない（Req 3.2 — NOT_FOUND）
    // -----------------------------------------------------------------------
    return {
      ok: false as const,
      error: {
        code: 'NOT_FOUND',
        message: '指定ユーザーはこの会社のメンバーではありません',
      },
    };
  },
);

'use server';

/**
 * revokeCompanyInvitation — 企業ユーザー招待取消 Server Action
 *
 * 管理者が保留中（pending）の招待を取り消し、受諾不可にする。
 * 既に取り消し済みまたは受諾済みの招待は取り消せない。
 *
 * Requirements: 3.3, 3.5, 6.1
 */

import { adminAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { companyUserInvitation } from '@bulr/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const revokeCompanyInvitationSchema = z.object({
  invitationId: z.string().min(1),
});

export const revokeCompanyInvitation = adminAction(
  revokeCompanyInvitationSchema,
  async ({ invitationId }) => {
    // -----------------------------------------------------------------------
    // 1. 条件付き UPDATE: status が 'pending' の行のみ 'revoked' に更新する（Req 3.3）
    //    RETURNING で更新された行の id を取得する。
    // -----------------------------------------------------------------------
    const updated = await db
      .update(companyUserInvitation)
      .set({
        status: 'revoked',
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(companyUserInvitation.id, invitationId),
          eq(companyUserInvitation.status, 'pending'),
        ),
      )
      .returning({ id: companyUserInvitation.id });

    // -----------------------------------------------------------------------
    // 2. 更新行が返った場合 → 取消成功
    // -----------------------------------------------------------------------
    if (updated.length > 0) {
      // キャッシュ再検証: 招待が属する会社のページを更新する
      // invitationId のみ受け取るため、companyId を招待レコードから取得する
      const [inv] = await db
        .select({ companyId: companyUserInvitation.companyId })
        .from(companyUserInvitation)
        .where(eq(companyUserInvitation.id, invitationId))
        .limit(1);

      if (inv) {
        revalidatePath(`/companies/${inv.companyId}`);
      }

      return { ok: true as const, data: { ok: true as const } };
    }

    // -----------------------------------------------------------------------
    // 3. 更新行なし → 招待が存在しないか、status が 'pending' 以外
    //    → 招待レコードを SELECT して理由を判定する
    // -----------------------------------------------------------------------
    const [existing] = await db
      .select({
        id: companyUserInvitation.id,
        status: companyUserInvitation.status,
        companyId: companyUserInvitation.companyId,
      })
      .from(companyUserInvitation)
      .where(eq(companyUserInvitation.id, invitationId))
      .limit(1);

    if (!existing) {
      // 招待レコード自体が存在しない（Req 3.3 — NOT_FOUND）
      return {
        ok: false as const,
        error: { code: 'NOT_FOUND', message: '招待が見つかりません' },
      };
    }

    // 招待は存在するが status が 'pending' ではない（Req 3.3 — NOT_PENDING）
    return {
      ok: false as const,
      error: {
        code: 'NOT_PENDING',
        message: '保留中ではない招待は取り消せません',
      },
    };
  },
);

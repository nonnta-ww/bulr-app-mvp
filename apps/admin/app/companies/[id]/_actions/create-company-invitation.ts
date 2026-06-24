'use server';

/**
 * createCompanyInvitation — 企業ユーザー招待発行 Server Action
 *
 * 管理者がメールアドレスと役割を指定して企業ユーザーを会社に招待する。
 * 招待トークンを生成して DB に保存し、受諾用リンクを含む招待メールを送信する。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.4
 */

import { adminAction, sendEmail, emailSchema, companyRoleSchema } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { company, companyUserInvitation, user, userProfile } from '@bulr/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { renderCompanyInvitationEmail } from '@/lib/company-invitation-template';
import { isUniqueViolation } from './pg-error';

/** 招待の有効期限（日数） */
const INVITATION_TTL_DAYS = 7;

const createCompanyInvitationSchema = z.object({
  companyId: z.string().min(1),
  email: emailSchema,
  roleInOrg: companyRoleSchema,
});

export const createCompanyInvitation = adminAction(
  createCompanyInvitationSchema,
  async ({ companyId, email: rawEmail, roleInOrg }, ctx) => {
    // メールアドレスを小文字正規化（emailSchema が trim するが lowercase は明示する）
    const email = rawEmail.toLowerCase().trim();

    // -----------------------------------------------------------------------
    // 1. 会社の存在確認とステータス確認（Req 1.5）
    // -----------------------------------------------------------------------
    const [companyRow] = await db
      .select({ id: company.id, name: company.name, status: company.status })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    if (!companyRow) {
      return {
        ok: false as const,
        error: { code: 'NOT_FOUND', message: '会社が見つかりません' },
      };
    }

    if (companyRow.status !== 'active') {
      return {
        ok: false as const,
        error: {
          code: 'COMPANY_INACTIVE',
          message: '一時停止/解約中の会社には招待できません',
        },
      };
    }

    // -----------------------------------------------------------------------
    // 2. 招待先メールアドレスのユーザーが既に会社所属済みか確認（Req 1.4）
    // -----------------------------------------------------------------------
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser) {
      const [profile] = await db
        .select({ companyId: userProfile.companyId })
        .from(userProfile)
        .where(eq(userProfile.userId, existingUser.id))
        .limit(1);

      if (profile?.companyId !== null && profile?.companyId !== undefined) {
        return {
          ok: false as const,
          error: {
            code: 'ALREADY_MEMBER',
            message: '指定ユーザーは既にいずれかの会社に所属しています',
          },
        };
      }
    }

    // -----------------------------------------------------------------------
    // 3. 受諾リンクの base URL を INSERT 前に解決する。
    //    BUSINESS_BASE_URL 未設定のまま INSERT すると、メール送信不能なのに
    //    pending レコードだけが残り、partial unique により以後の招待が
    //    ALREADY_INVITED でブロックされてしまう（ファントム行）。
    //    そのため env チェックは副作用（INSERT）より前に行う。
    // -----------------------------------------------------------------------
    const businessBaseUrl = process.env.BUSINESS_BASE_URL;
    if (!businessBaseUrl) {
      return {
        ok: false as const,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'BUSINESS_BASE_URL が設定されていません。環境変数を確認してください。',
        },
      };
    }

    // -----------------------------------------------------------------------
    // 4. 招待レコードの INSERT（Req 1.1, 1.3）
    //    partial unique index の違反 → ALREADY_INVITED（Req 1.3）
    // -----------------------------------------------------------------------
    const token = nanoid();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitationId = nanoid();

    try {
      await db.insert(companyUserInvitation).values({
        id: invitationId,
        companyId,
        email,
        roleInOrg,
        token,
        status: 'pending',
        invitedByUserId: ctx.userId,
        expiresAt,
      });
    } catch (err) {
      if (isUniqueViolation(err, 'company_user_invitation_company_email_pending_uniq')) {
        return {
          ok: false as const,
          error: {
            code: 'ALREADY_INVITED',
            message: 'この会社・メール宛の保留中の招待が既に存在します',
          },
        };
      }
      throw err;
    }

    // -----------------------------------------------------------------------
    // 5. 招待メールの送信（Req 1.1, 1.2）
    // -----------------------------------------------------------------------
    const url = `${businessBaseUrl}/invitations/${token}`;
    const { subject, html, text } = renderCompanyInvitationEmail({
      url,
      companyName: companyRow.name,
    });

    await sendEmail({ to: email, subject, html, text });

    // -----------------------------------------------------------------------
    // 6. キャッシュ再検証
    // -----------------------------------------------------------------------
    revalidatePath(`/companies/${companyId}`);

    return { ok: true as const, data: { invitationId } };
  },
);

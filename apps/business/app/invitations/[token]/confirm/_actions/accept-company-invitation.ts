'use server';

/**
 * acceptCompanyInvitation — 会社ユーザー招待を受諾して company_id / role_in_org を設定する Server Action
 *
 * - authedAction でラップし、ctx.userId / ctx.email を取得する。
 * - invitation を token で検索し、status・期限・会社ステータス・メール一致・未所属を検証する。
 * - transaction 内で招待を accepted に条件付き UPDATE + recheck（race-safe）し、
 *   user_profile.company_id / role_in_org を設定する。
 * - 成功時は /openings にリダイレクトする（transaction 外）。
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 6.4
 */

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { authedAction, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { companyUserInvitation, company, userProfile } from '@bulr/db/schema';

const acceptCompanyInvitationSchema = z.object({
  token: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/).max(256),
});

export const acceptCompanyInvitation = authedAction(
  acceptCompanyInvitationSchema,
  async ({ token }, ctx) => {
    // 1. invitation を token で SELECT（company JOIN）
    const [inv] = await db
      .select({
        id: companyUserInvitation.id,
        status: companyUserInvitation.status,
        email: companyUserInvitation.email,
        roleInOrg: companyUserInvitation.roleInOrg,
        expiresAt: companyUserInvitation.expiresAt,
        companyId: companyUserInvitation.companyId,
        companyStatus: company.status,
        companyName: company.name,
      })
      .from(companyUserInvitation)
      .innerJoin(company, eq(company.id, companyUserInvitation.companyId))
      .where(eq(companyUserInvitation.token, token))
      .limit(1);

    if (!inv) {
      return { ok: false as const, error: { code: 'INVALID_TOKEN', message: '招待リンクが無効です' } };
    }

    // 2. status チェック（Req 2.3）
    if (inv.status === 'revoked') {
      return { ok: false as const, error: { code: 'REVOKED', message: 'この招待は取り消されています' } };
    }
    if (inv.status === 'accepted') {
      return { ok: false as const, error: { code: 'ALREADY_CONSUMED', message: 'この招待は既に使用されています' } };
    }

    // 3. 期限チェック（Req 2.3）
    if (inv.expiresAt <= new Date()) {
      return { ok: false as const, error: { code: 'EXPIRED', message: 'この招待リンクは有効期限が切れています' } };
    }

    // 4. 会社ステータスチェック（Req 2.6）
    if (inv.companyStatus !== 'active') {
      return { ok: false as const, error: { code: 'COMPANY_INACTIVE', message: '会社が利用停止中のため受諾できません' } };
    }

    // 5. メール一致チェック（Req 6.4 — トークン横流し対策）
    if (inv.email.toLowerCase() !== ctx.email.toLowerCase()) {
      return { ok: false as const, error: { code: 'EMAIL_MISMATCH', message: '招待先のメールアドレスと一致しません' } };
    }

    // 6. 既所属チェック（Req 2.5）
    const [profile] = await db
      .select({ companyId: userProfile.companyId })
      .from(userProfile)
      .where(eq(userProfile.userId, ctx.userId))
      .limit(1);

    if (profile?.companyId != null) {
      return { ok: false as const, error: { code: 'ALREADY_MEMBER', message: '既にいずれかの会社に所属しています' } };
    }

    // 7. transaction: 招待を accepted に条件付き UPDATE + recheck（race-safe）、user_profile 更新（Req 2.1, 2.7）
    try {
      await db.transaction(async (tx) => {
        // 条件付き UPDATE: status='pending' のときのみ更新（race condition 対策）
        await tx
          .update(companyUserInvitation)
          .set({
            status: 'accepted',
            acceptedAt: sql`now()`,
            acceptedByUserId: ctx.userId,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(companyUserInvitation.id, inv.id),
              eq(companyUserInvitation.status, 'pending'),
            ),
          );

        // recheck: 本当に自分が accepted に更新できたかを確認
        const [recheck] = await tx
          .select({ status: companyUserInvitation.status, acceptedByUserId: companyUserInvitation.acceptedByUserId })
          .from(companyUserInvitation)
          .where(eq(companyUserInvitation.id, inv.id))
          .limit(1);

        if (!recheck || recheck.status !== 'accepted' || recheck.acceptedByUserId !== ctx.userId) {
          throw new Error('CONSUME_RACE');
        }

        // user_profile に company_id と role_in_org を設定（Req 2.1）
        await tx
          .update(userProfile)
          .set({
            companyId: inv.companyId,
            roleInOrg: inv.roleInOrg,
            updatedAt: sql`now()`,
          })
          .where(eq(userProfile.userId, ctx.userId));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('CONSUME_RACE')) {
        return { ok: false as const, error: { code: 'ALREADY_CONSUMED', message: '他のリクエストが先に受諾しました' } };
      }
      if (err instanceof AuthError) {
        return { ok: false as const, error: { code: err.code, message: err.message } };
      }
      throw err;
    }

    // cookie クリア（__Secure- プレフィックス付き名も考慮: 両方を maxAge: 0 でクリア）
    const cookieStore = await cookies();
    cookieStore.set('pending_invitation_token', '', { maxAge: 0, path: '/' });
    cookieStore.set('__Secure-pending_invitation_token', '', { maxAge: 0, path: '/', secure: true });

    // redirect は transaction の外で呼ぶ（Req 2.2）
    redirect('/openings');
  },
);

'use server';

/**
 * updateOpening — 募集更新 Server Action
 *
 * authedAction でラップし、requireCompanyUser で企業所属を確認する。
 * id AND companyId で対象 opening の所有を検証し（無ければ AuthError('NOT_FOUND')）、
 * title / description / status / updatedAt を更新する。
 * 成功後は一覧・詳細を revalidate し、詳細ページへリダイレクトする。
 *
 * Design: docs/superpowers/specs/2026-06-21-opening-edit-design.md
 */

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { authedAction, requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { opening } from '@bulr/db/schema';

const schema = z.object({
  openingId: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, 'タイトルを入力してください')
    .max(200, 'タイトルは200文字以内で入力してください'),
  description: z
    .string()
    .trim()
    .max(5000, '説明は5000文字以内で入力してください')
    .optional(),
  status: z.enum(['draft', 'open', 'closed']),
});

export const updateOpening = authedAction(
  schema,
  async ({ openingId, title, description, status }, _ctx) => {
    const { companyId } = await requireCompanyUser();

    // 所有権検証（id AND company_id で絞り込み — 他社の opening は対象外）
    const [owned] = await db
      .select({ id: opening.id })
      .from(opening)
      .where(and(eq(opening.id, openingId), eq(opening.companyId, companyId)))
      .limit(1);

    if (!owned) throw new AuthError('NOT_FOUND');

    await db
      .update(opening)
      .set({ title, description: description ?? null, status, updatedAt: new Date() })
      .where(eq(opening.id, openingId));

    revalidatePath('/openings');
    revalidatePath(`/openings/${openingId}`);
    redirect(`/openings/${openingId}`);
  },
);

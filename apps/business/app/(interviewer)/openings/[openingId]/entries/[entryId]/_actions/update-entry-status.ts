'use server';

/**
 * updateEntryStatus — エントリーステータス更新 Server Action
 *
 * - authedAction でラップし、requireCompanyUser で企業所属を確認する。
 * - getEntryWithSnapshots で所有権（opening.companyId === companyId）を検証する。
 * - 'reviewed' / 'rejected' のみ受け付ける（'progressing' は session-from-entry の責務）。
 * - UPDATE 後に revalidatePath して UI を再検証する。
 *
 * Requirements: entry-flow 4.2（updateEntryStatus 範囲）
 */

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authedAction, requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db, getEntryWithSnapshots } from '@bulr/db';
import { entry } from '@bulr/db/schema';

const updateEntryStatusSchema = z.object({
  entryId: z.string().min(1),
  openingId: z.string().min(1),
  status: z.enum(['reviewed', 'rejected']),
});

export const updateEntryStatus = authedAction(
  updateEntryStatusSchema,
  async ({ entryId, openingId, status }, _ctx) => {
    const { companyId } = await requireCompanyUser();

    // エントリー取得 + 所有権検証
    const entryData = await getEntryWithSnapshots(entryId);
    if (!entryData) throw new AuthError('NOT_FOUND');
    if (entryData.opening.companyId !== companyId) throw new AuthError('FORBIDDEN');

    // ステータス更新
    await db
      .update(entry)
      .set({ status, updatedAt: new Date() })
      .where(eq(entry.id, entryId));

    revalidatePath(`/openings/${openingId}/entries/${entryId}`);
    revalidatePath(`/openings/${openingId}/entries`);

    return { ok: true };
  },
);

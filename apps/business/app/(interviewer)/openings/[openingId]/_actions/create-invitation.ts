'use server';

/**
 * createInvitation — 招待リンク発行 Server Action
 *
 * authedAction でラップし、requireCompanyUser で企業所属を確認してから
 * opening の所有権を検証し、招待トークンを生成・保存する。
 * URL は token から表示時に組み立てるため DB には token のみ保存する。
 *
 * Requirements: company-and-opening 6.x, 7.x, 8.x
 */

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';

import { authedAction, requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { opening, invitation } from '@bulr/db/schema';

const schema = z.object({
  openingId: z.string().min(1),
});

export const createInvitation = authedAction(schema, async ({ openingId }, _ctx) => {
  const { companyId } = await requireCompanyUser();

  // 所有権検証: opening が company に属することを確認
  const [ownedOpening] = await db
    .select({ id: opening.id })
    .from(opening)
    .where(and(eq(opening.id, openingId), eq(opening.companyId, companyId)))
    .limit(1);

  if (!ownedOpening) throw new AuthError('NOT_FOUND');

  const candidateBaseUrl = process.env.CANDIDATE_BASE_URL;
  if (!candidateBaseUrl) {
    throw new Error('CANDIDATE_BASE_URL is not set');
  }

  // token 生成: crypto.randomBytes(32).toString('base64url')
  // URL-safe (A-Za-z0-9_-), 256bit entropy, ~43 chars
  // candidate-auth-onboarding 7.1 の regex /^[A-Za-z0-9_-]+$/ に必ずマッチする
  const token = randomBytes(32).toString('base64url');

  // DB INSERT (token のみ保存、URL 全体は保存しない)
  await db.insert(invitation).values({
    id: nanoid(),
    openingId,
    token,
  });

  revalidatePath(`/openings/${openingId}`);
  revalidatePath(`/openings/${openingId}/invitations`);

  return { invitationUrl: `${candidateBaseUrl}/invitations/${token}` };
});

'use server';

/**
 * createCandidateProfile — オンボーディング用 Server Action
 *
 * 認証済みユーザの candidate_profile を新規作成する。
 * - authedAction でラップし、ctx.userId でユーザを識別する。
 * - requireCandidate() は呼ばない（プロファイル作成前なので存在しない）。
 * - 成功後は '/' にリダイレクトする。
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import { authedAction } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';

const createProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'お名前を入力してください')
    .max(100, 'お名前は100文字以内で入力してください'),
});

export const createCandidateProfile = authedAction(
  createProfileSchema,
  async (_input, ctx) => {
    const { displayName } = _input;
    const { userId } = ctx;

    await db
      .insert(candidateProfile)
      .values({ id: nanoid(), userId, displayName })
      .onConflictDoNothing();

    redirect('/');
  },
);

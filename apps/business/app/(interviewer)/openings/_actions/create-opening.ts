'use server';

/**
 * createOpening — 募集新規作成 Server Action
 *
 * authedAction でラップし、requireCompanyUser で企業所属を確認してから
 * opening レコードを挿入する。成功後は詳細ページにリダイレクトする。
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import { authedAction, requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { opening } from '@bulr/db/schema';

const schema = z.object({
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
  status: z.enum(['draft', 'open', 'closed']).default('draft'),
});

export const createOpening = authedAction(schema, async ({ title, description, status }, _ctx) => {
  // authedAction ctx.userId は内部の requireCompanyUser が requireUser を呼ぶため
  // 二重取得になるが、authedAction シグネチャの統一性を優先して引数のまま残す。
  const { companyId } = await requireCompanyUser();
  const id = nanoid();
  await db.insert(opening).values({ id, companyId, title, description: description ?? null, status });
  redirect(`/openings/${id}`);
});

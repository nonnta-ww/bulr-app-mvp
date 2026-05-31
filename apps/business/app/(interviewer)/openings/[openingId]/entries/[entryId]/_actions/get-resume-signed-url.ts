'use server';

/**
 * getResumeSignedUrlForBusiness — 企業ユーザー向け履歴書署名 URL 取得 Server Action
 *
 * - authedAction でラップし、requireCompanyUser で企業所属を確認する。
 * - getEntryWithSnapshots でエントリーを取得し、所有権（opening.companyId）を検証する。
 * - 履歴書が存在する場合は Vercel Blob の head() で downloadUrl（署名 URL）を取得して返す。
 * - BLOB_READ_WRITE_TOKEN はサーバーサイドのみで使用する。
 *
 * Requirements: entry-flow 2.2
 */

import { z } from 'zod';
import { head } from '@vercel/blob';

import { authedAction, requireCompanyUser, AuthError } from '@bulr/auth/server';
import { getEntryWithSnapshots } from '@bulr/db';

const getResumeSignedUrlSchema = z.object({
  entryId: z.string().min(1),
  openingId: z.string().min(1),
});

export const getResumeSignedUrlForBusiness = authedAction(
  getResumeSignedUrlSchema,
  async ({ entryId, openingId: _openingId }, _ctx) => {
    const { companyId } = await requireCompanyUser();

    const entryData = await getEntryWithSnapshots(entryId);
    if (!entryData) {
      return { ok: false as const, error: { code: 'NOT_FOUND', message: 'エントリーが見つかりません' } };
    }

    // 所有権検証: getEntryWithSnapshots 戻り値の opening.companyId で直接比較
    // (追加の opening SELECT は不要 — entryData.opening は既に JOIN 取得済み)
    if (entryData.opening.companyId !== companyId) {
      throw new AuthError('FORBIDDEN');
    }

    if (!entryData.entry.resumeDocumentId || !entryData.resumeDocument) {
      return { ok: false as const, error: { code: 'RESUME_NOT_AVAILABLE', message: '履歴書が削除されたか未登録です' } };
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) throw new Error('BLOB_READ_WRITE_TOKEN is not set');

    const blob = await head(entryData.resumeDocument.blobPathname, { token: blobToken });

    return { ok: true as const, data: { signedUrl: blob.downloadUrl } };
  },
);

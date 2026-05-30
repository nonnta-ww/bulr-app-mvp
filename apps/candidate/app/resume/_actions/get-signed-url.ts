'use server';

/**
 * getSignedUrlAction — Blob 署名 URL 発行 Server Action
 *
 * - requireCandidate() で所有権確認 + candidate_profile_id スコープで pathname を SELECT
 * - head(blobPathname, { token: BLOB_READ_WRITE_TOKEN }) を呼んで downloadUrl を取得
 * - クライアントには raw blob_url を返さず、TTL 付き downloadUrl のみを返す
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3, 8.4
 *
 * authedAction wrapper を使わない理由は upload-resume.ts のコメント参照。
 */

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { head } from '@vercel/blob';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { resumeDocument } from '@bulr/db/schema';

const inputSchema = z.object({
  documentId: z.string().min(1).max(64),
});

type SignedUrlResult =
  | { ok: true; data: { downloadUrl: string } }
  | { ok: false; error: { code: 'UNAUTHORIZED' | 'CANDIDATE_PROFILE_MISSING' | 'NOT_FOUND' | 'INVALID_INPUT' | 'BLOB_HEAD_FAILED'; message: string } };

export async function getSignedUrlAction(formData: FormData): Promise<SignedUrlResult> {
  try {
    const { candidateProfile } = await requireCandidate();

    const parsed = inputSchema.safeParse({ documentId: formData.get('documentId') });
    if (!parsed.success) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'リクエストが不正です。' } };
    }
    const { documentId } = parsed.data;

    // 所有権スコープで pathname を取得
    const [target] = await db
      .select({ blobPathname: resumeDocument.blobPathname })
      .from(resumeDocument)
      .where(
        and(
          eq(resumeDocument.id, documentId),
          eq(resumeDocument.candidateProfileId, candidateProfile.id),
        ),
      )
      .limit(1);

    if (!target) {
      return { ok: false, error: { code: 'NOT_FOUND', message: '指定された履歴書が見つかりません。' } };
    }

    // Blob head で downloadUrl を発行 (TTL 付き)
    try {
      const meta = await head(target.blobPathname, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return { ok: true, data: { downloadUrl: meta.downloadUrl } };
    } catch {
      return { ok: false, error: { code: 'BLOB_HEAD_FAILED', message: 'ファイル URL の発行に失敗しました。再試行してください。' } };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'サインインが必要です。' } };
      }
      if (err.code === 'CANDIDATE_PROFILE_MISSING') {
        return { ok: false, error: { code: 'CANDIDATE_PROFILE_MISSING', message: '候補者プロフィールが未作成です。' } };
      }
    }
    throw err;
  }
}

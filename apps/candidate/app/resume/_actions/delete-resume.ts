'use server';

/**
 * deleteResumeAction — 履歴書削除 Server Action
 *
 * - requireCandidate() で所有権確認 + candidate_profile_id スコープで対象を SELECT
 * - ResumeStorageClient.delete(blobPathname) でファイル削除（local-fs / vercel-blob）
 * - ファイル削除成功時のみ DB の resume_document 行を DELETE
 * - ファイル削除失敗時は DB を変更せず BLOB_DELETE_FAILED を返す
 *
 * Requirements: 2.5, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4
 *
 * authedAction wrapper を使わない理由は app/api/resume/upload/route.ts のコメント参照。
 */

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { resumeDocument } from '@bulr/db/schema';

import { getResumeStorage } from '../../../lib/resume-storage/storage';

const inputSchema = z.object({
  documentId: z.string().min(1).max(64),
});

type DeleteResult =
  | { ok: true }
  | { ok: false; error: { code: 'UNAUTHORIZED' | 'CANDIDATE_PROFILE_MISSING' | 'NOT_FOUND' | 'INVALID_INPUT' | 'BLOB_DELETE_FAILED' | 'DB_DELETE_FAILED'; message: string } };

export async function deleteResumeAction(formData: FormData): Promise<DeleteResult> {
  try {
    const { candidateProfile } = await requireCandidate();

    const parsed = inputSchema.safeParse({ documentId: formData.get('documentId') });
    if (!parsed.success) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'リクエストが不正です。' } };
    }
    const { documentId } = parsed.data;

    // 所有権スコープで pathname を取得 (cross-tenant 防止)
    const [target] = await db
      .select({ id: resumeDocument.id, blobPathname: resumeDocument.blobPathname })
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

    // ファイル削除を先に実施 (失敗時は DB を変更しない)
    try {
      await getResumeStorage().delete(target.blobPathname);
    } catch {
      return { ok: false, error: { code: 'BLOB_DELETE_FAILED', message: 'ファイル削除に失敗しました。再試行してください。' } };
    }

    // DB 行削除
    try {
      await db.delete(resumeDocument).where(eq(resumeDocument.id, target.id));
      return { ok: true };
    } catch {
      // Blob は既に削除済み。DB のみ残ると参照不可能な孤児になるが、
      // MVP では再試行で resolve できると期待 (本格対応は後続 spec で sweep job 検討)
      return { ok: false, error: { code: 'DB_DELETE_FAILED', message: 'データベース削除に失敗しました。' } };
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

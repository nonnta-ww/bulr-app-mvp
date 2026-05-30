'use server';

/**
 * setPrimaryResumeAction — 履歴書 primary フラグ更新 Server Action
 *
 * - requireCandidate() で所有権確認 (UNAUTHORIZED / CANDIDATE_PROFILE_MISSING)
 * - DB トランザクション内で:
 *   1. 同 candidate_profile_id + 同 kind の全ドキュメントを is_primary=false に UPDATE
 *   2. 指定ドキュメントを is_primary=true に UPDATE
 * - 対象ドキュメントが他候補者のものなら NOT_FOUND を返す (cross-tenant 防止)
 *
 * Requirements: 6.1, 6.2, 8.1, 8.2, 8.3, 8.4
 *
 * authedAction wrapper を使わない理由は upload-resume.ts のコメント参照
 * (パターン統一: requireCandidate 直呼び出しでセキュリティ等価性を担保)
 */

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { resumeDocument } from '@bulr/db/schema';

const inputSchema = z.object({
  documentId: z.string().min(1).max(64),
});

type SetPrimaryResult =
  | { ok: true }
  | { ok: false; error: { code: 'UNAUTHORIZED' | 'CANDIDATE_PROFILE_MISSING' | 'NOT_FOUND' | 'INVALID_INPUT' | 'DB_UPDATE_FAILED'; message: string } };

export async function setPrimaryResumeAction(formData: FormData): Promise<SetPrimaryResult> {
  try {
    const { candidateProfile } = await requireCandidate();

    const parsed = inputSchema.safeParse({ documentId: formData.get('documentId') });
    if (!parsed.success) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'リクエストが不正です。' } };
    }
    const { documentId } = parsed.data;

    // 対象ドキュメントを所有権スコープで取得 (kind を知るため + cross-tenant 防止)
    const [target] = await db
      .select({ id: resumeDocument.id, kind: resumeDocument.kind })
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

    // atomic に primary を切り替え
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(resumeDocument)
          .set({ isPrimary: false })
          .where(
            and(
              eq(resumeDocument.candidateProfileId, candidateProfile.id),
              eq(resumeDocument.kind, target.kind),
            ),
          );

        await tx
          .update(resumeDocument)
          .set({ isPrimary: true })
          .where(eq(resumeDocument.id, target.id));
      });
      return { ok: true };
    } catch {
      return { ok: false, error: { code: 'DB_UPDATE_FAILED', message: '更新に失敗しました。再試行してください。' } };
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

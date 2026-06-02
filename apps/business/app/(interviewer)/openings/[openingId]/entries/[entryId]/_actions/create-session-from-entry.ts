'use server';

/**
 * createSessionFromEntry — entry 経由で interview_session を作成する Server Action
 *
 * - authedAction でラップし、requireCompanyUser で企業所属を確認する（二重防御パターン）。
 * - getEntryWithSnapshots でエントリーを取得し、所有権（opening.companyId === companyId）を検証する。
 * - 既存セッション（同一 entry_id）が存在する場合はべき等に既存 ID を返す。
 * - 新規作成時: interview_session に INSERT し、entry.status を 'progressing' に更新する。
 * - 作成した（または既存の）sessionId を返す。
 *
 * Requirements: session-from-entry 2.1–2.8
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { authedAction, requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db, getEntryWithSnapshots } from '@bulr/db';
import { entry, interviewSession } from '@bulr/db/schema';

const createSessionFromEntrySchema = z.object({
  entryId: z.string().min(1),
  selectedPatternCodes: z.array(z.string()).min(1).max(20),
});

export const createSessionFromEntry = authedAction(
  createSessionFromEntrySchema,
  async ({ entryId, selectedPatternCodes }, { userId }) => {
    const { companyId } = await requireCompanyUser();

    // 1. entry 取得 + 所有権検証
    const entryData = await getEntryWithSnapshots(entryId);
    if (!entryData) {
      return {
        ok: false as const,
        error: { code: 'ENTRY_NOT_FOUND', message: 'エントリーが見つかりません' },
      };
    }

    if (entryData.opening.companyId !== companyId) {
      throw new AuthError('FORBIDDEN');
    }

    // 2. 既存セッション確認（べき等性）
    const existingSessions = await db
      .select({ id: interviewSession.id })
      .from(interviewSession)
      .where(eq(interviewSession.entry_id, entryId))
      .limit(1);

    if (existingSessions.length > 0 && existingSessions[0]) {
      return { ok: true as const, data: { sessionId: existingSessions[0].id } };
    }

    // 3. トランザクションで interview_session INSERT + entry status 更新
    let sessionId: string;

    await db.transaction(async (tx) => {
      const [session] = await tx
        .insert(interviewSession)
        .values({
          interviewer_id: userId,
          candidate_id: null,
          entry_id: entryId,
          planned_pattern_codes: selectedPatternCodes,
        })
        .returning({ id: interviewSession.id });

      if (!session) {
        throw new Error('interview_session の作成に失敗しました');
      }

      sessionId = session.id;

      await tx
        .update(entry)
        .set({ status: 'progressing', updatedAt: new Date() })
        .where(eq(entry.id, entryId));
    });

    return { ok: true as const, data: { sessionId: sessionId! } };
  },
);

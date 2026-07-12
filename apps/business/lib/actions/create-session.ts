'use server';

/**
 * createSession Server Action
 *
 * 候補者情報を受け取り、candidate レコードと interview_session レコードを作成し、
 * 面接中ページにリダイレクトする。
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 15.2, 20.4
 * (rtic Requirement 3.8/3.9 の「defaultNow() による自動同意」は
 *  interview-consent-gate spec が supersede 済み。consent 列は本アクションで
 *  書き込まず、未同意状態のままセッションを開始する。)
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@bulr/db';
import { schema } from '@bulr/db';

import { checkAndIncrement } from '@bulr/lib';
import { authedAction } from '@bulr/auth/server';
import { selectPlannedPatterns } from '@/lib/queries/select-planned-patterns';

// ---------------------------------------------------------------------------
// 入力スキーマ（Requirement 3.2）
// ---------------------------------------------------------------------------

const createSessionSchema = z.object({
  name: z.string().min(1).max(100),
  applied_role: z.string().min(1).max(100),
  background_summary: z.string().min(1).max(5000),
  email: z.string().email().optional(),
});

// ---------------------------------------------------------------------------
// createSession Server Action（Requirement 3.3, 20.4）
// ---------------------------------------------------------------------------

export const createSession = authedAction(
  createSessionSchema,
  async (input, { userId }) => {
    // Step 1: レート制限チェック（Requirement 3.6, 15.2）
    // key: 'session:{userId}:{YYYY-MM-DD}', limit: 5 回/日
    await checkAndIncrement(
      'session:' + userId + ':' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      { limit: 5, windowMs: 86_400_000 },
    );

    // Step 2: assessment_pattern から is_active=true の全パターンを取得（Requirement 3.5）
    const allActivePatterns = await db.query.assessmentPattern.findMany({
      where: (ap, { eq }) => eq(ap.is_active, true),
    });

    // Step 3: selectPlannedPatterns で 8-12 件の pattern_code を選定（Requirement 3.5）
    const plannedPatternCodes = selectPlannedPatterns({
      backgroundSummary: input.background_summary,
      allActivePatterns,
    });

    // Step 4: トランザクションで candidate + interview_session を INSERT（Requirement 3.4, 3.8, 3.9）
    let sessionId: string;

    await db.transaction(async (tx) => {
      // candidate INSERT
      const [candidate] = await tx
        .insert(schema.candidate)
        .values({
          name: input.name,
          applied_role: input.applied_role,
          background_summary: input.background_summary,
          email: input.email,
        })
        .returning({ id: schema.candidate.id });

      if (!candidate) {
        throw new Error('candidate の作成に失敗しました');
      }

      // interview_session INSERT（Requirement 3.4, 3.8, 3.9）
      const [session] = await tx
        .insert(schema.interviewSession)
        .values({
          interviewer_id: userId,
          candidate_id: candidate.id,
          status: 'in_progress',
          role: 'backend',
          planned_pattern_codes: plannedPatternCodes,
          // consent 列は意図的に書き込まない。旧 Requirement 3.8/3.9（defaultNow() による
          // 自動同意）は interview-consent-gate spec が supersede した。
          // consent_obtained_at は migration 0023 で default 撤去・nullable 化されており、
          // ここで触れないことで新規セッションは未同意（null）状態で開始する
          // （interview-consent-gate Requirement 2.4, 5.2）。
          // consent_version のみ notNull default 'ja-v1' を維持（同意「版」は同意取得前でも
          // 現行版として意味を持つため）。
        })
        .returning({ id: schema.interviewSession.id });

      if (!session) {
        throw new Error('interview_session の作成に失敗しました');
      }

      sessionId = session.id;
    });

    // Step 5: redirect（Requirement 3.7）
    // redirect は Server Action 内では throw を使うため、transaction の外で呼ぶ
    redirect('/interviews/' + sessionId!);
  },
);

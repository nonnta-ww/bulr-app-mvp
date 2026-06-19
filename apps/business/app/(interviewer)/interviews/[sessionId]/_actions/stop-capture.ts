'use server';

/**
 * stopCapture — キャプチャ停止/中止 Server Action（CaptureOrchestrator の停止半分）
 *
 * 責務:
 *  - finish: capture_status を stopping に遷移（Req 5.1）
 *  - abort:  capture_status を aborted に遷移（Req 7.6）
 *  - bot が存在する場合は best-effort でボットを退出させる
 *  - abort 後は subsequent webhook が破棄対象となるため解析は再開しない（design.md 7.6）
 *  - 遷移不可な状態からの呼び出しは { ok:false, error } を返す（ユーザーへの throw なし）
 *
 * Requirements: 5.1, 7.1, 7.6
 * Design: CaptureOrchestrator (Service Interface, Responsibilities & Constraints),
 *         WebhookIngestion (Implementation Notes: aborted セッションのイベントは破棄)
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { authedAction, requireSessionOwnership } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { interviewSession } from '@bulr/db/schema';

import { createRecallClient } from '../../../../../lib/capture/recall-client';
import { canTransition, type CaptureStatus } from '../../../../../lib/capture/capture-status';

// ---------------------------------------------------------------------------
// 入力スキーマ（Zod）
// ---------------------------------------------------------------------------

const stopCaptureSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.enum(['finish', 'abort']),
});

// ---------------------------------------------------------------------------
// stopCapture アクション
// ---------------------------------------------------------------------------

/**
 * キャプチャ停止/中止 Server Action。
 *
 * 成功時 (finish): `{ ok:true, data:{ captureStatus:'stopping' } }`
 * 成功時 (abort):  `{ ok:true, data:{ captureStatus:'aborted' } }`
 * 失敗時（遷移不可）: `{ ok:false, error:{ code:'INVALID_STATE_TRANSITION', ... } }`
 * 失敗時（認証・所有権）: authedAction 外層で `{ ok:false, error:{ code:'FORBIDDEN', ... } }`
 *
 * 注意: authedAction は handler の戻り値を `{ ok:true, data }` でラップするため、
 * 呼び出し元は 2 段階読みを行う（start-capture.ts と同じパターン）。
 */
export const stopCapture = authedAction(
  stopCaptureSchema,
  async ({ sessionId, reason }, { userId }) => {
    // -----------------------------------------------------------------------
    // 1. セッション取得
    // -----------------------------------------------------------------------
    const session = await db.query.interviewSession.findFirst({
      where: eq(interviewSession.id, sessionId),
    });

    // -----------------------------------------------------------------------
    // 2. 所有権チェック（Req 7.1）
    // -----------------------------------------------------------------------
    requireSessionOwnership(
      session ? { interviewerId: session.interviewer_id } : null,
      userId,
    );

    const sess = session!;
    const currentStatus = sess.capture_status as CaptureStatus;
    const targetStatus: CaptureStatus = reason === 'abort' ? 'aborted' : 'stopping';

    // -----------------------------------------------------------------------
    // 3. 遷移ガード
    //    許可されない遷移はユーザーへの throw ではなく {ok:false} で返す。
    //    例: stopped → abort は遷移不可（terminal 状態）
    // -----------------------------------------------------------------------
    if (!canTransition(currentStatus, targetStatus)) {
      return {
        ok: false as const,
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `現在の状態 (${currentStatus}) からの ${reason} は許可されていません`,
        },
      };
    }

    // -----------------------------------------------------------------------
    // 4. capture_status を更新
    //    abort の場合: この時点で 'aborted' になるため、以降の webhook は
    //    WebhookIngestion 側で破棄される（design.md: Implementation Notes）
    //
    //    abort 時はセッション自体も中断扱いとし interview_session.status を
    //    'abandoned' に更新する（C案）。一覧で「中断」と正しく表示され、
    //    in_progress のまま残って実態とズレるのを防ぐ。
    //    finish の場合は status を変更しない（finalize が 'completed' にする）。
    // -----------------------------------------------------------------------
    await db
      .update(interviewSession)
      .set({
        capture_status: targetStatus,
        ...(reason === 'abort' ? { status: 'abandoned' as const } : {}),
        updated_at: new Date(),
      })
      .where(eq(interviewSession.id, sessionId));

    // -----------------------------------------------------------------------
    // 5. ボット退出（best-effort）
    //    bot_id が存在する場合のみ leaveBot を呼ぶ。
    //    失敗してもエラーを返さない（aborted ステータスが webhook 破棄を保証するため）。
    //    Result 型を返す recall-client は例外を throw しないが、
    //    予期しない例外（ネットワーク割り込み等）に備えて try/catch で囲む。
    // -----------------------------------------------------------------------
    if (sess.bot_id !== null) {
      const recallClient = createRecallClient();
      try {
        const leaveResult = await recallClient.leaveBot(sess.bot_id);
        if (!leaveResult.ok) {
          // best-effort: エラーをログに記録するが失敗として扱わない
          console.error(
            '[stopCapture] leaveBot returned error (best-effort, ignored):',
            leaveResult.error,
          );
        }
      } catch (err) {
        // 予期しない例外も best-effort で無視
        console.error(
          '[stopCapture] leaveBot threw unexpected error (best-effort, ignored):',
          err,
        );
      }
    }

    return {
      ok: true as const,
      data: { captureStatus: targetStatus },
    };
  },
);

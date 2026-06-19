'use server';

/**
 * pauseCapture / resumeCapture — キャプチャの一時停止/再開 Server Action（A案）
 *
 * 緊急停止用の stopCapture(abort) とは別物。録音ボットは通話に残したまま、
 * 一時停止中はトランスクリプトを破棄し AI 解析を止める「再開可能な一時停止」。
 *
 * 責務:
 *  - pause:  capture_status を recording → paused に遷移
 *  - resume: capture_status を paused → recording に遷移し、staleTranscript の
 *            誤検知を避けるため last_capture_event_at を now にリセットする
 *  - ボットには触れない（通話に残す）。停止中の発言破棄は WebhookIngestion /
 *    ChunkIngestion 側が capture_status==='paused' を見て行う。
 *  - 遷移不可な状態からの呼び出しは { ok:false, error } を返す（throw しない）
 *
 * Design: CaptureOrchestrator（一時停止/再開の状態遷移入口）
 *         WebhookIngestion / ChunkIngestion（paused セッションのセグメント破棄）
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { authedAction, requireSessionOwnership } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { interviewSession } from '@bulr/db/schema';

import { canTransition, type CaptureStatus } from '../../../../../lib/capture/capture-status';

// ---------------------------------------------------------------------------
// 入力スキーマ（Zod）
// ---------------------------------------------------------------------------

const pauseCaptureSchema = z.object({
  sessionId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 共通遷移ヘルパ
// ---------------------------------------------------------------------------

/**
 * capture_status を `target` に遷移させる共通処理。
 * 所有権チェック → 遷移ガード → 更新を行う。
 *
 * @param extraSet - 更新時に併せてセットする追加カラム（resume の last_capture_event_at 等）
 */
async function transitionCapture(
  sessionId: string,
  userId: string,
  target: CaptureStatus,
  extraSet: Partial<{ last_capture_event_at: Date }> = {},
) {
  const session = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });

  // 所有権チェック（Req 7.1）
  requireSessionOwnership(
    session ? { interviewerId: session.interviewer_id } : null,
    userId,
  );

  const currentStatus = session!.capture_status as CaptureStatus;

  // 遷移ガード（許可されない遷移は throw せず {ok:false} で返す）
  if (!canTransition(currentStatus, target)) {
    return {
      ok: false as const,
      error: {
        code: 'INVALID_STATE_TRANSITION',
        message: `現在の状態 (${currentStatus}) からの ${target} は許可されていません`,
      },
    };
  }

  await db
    .update(interviewSession)
    .set({
      capture_status: target,
      updated_at: new Date(),
      ...extraSet,
    })
    .where(eq(interviewSession.id, sessionId));

  return {
    ok: true as const,
    data: { captureStatus: target },
  };
}

// ---------------------------------------------------------------------------
// pauseCapture アクション（recording → paused）
// ---------------------------------------------------------------------------

/**
 * キャプチャを一時停止する Server Action。
 *
 * 成功時: `{ ok:true, data:{ captureStatus:'paused' } }`
 * 失敗時（遷移不可）: `{ ok:false, error:{ code:'INVALID_STATE_TRANSITION', ... } }`
 *
 * 注意: authedAction は handler の戻り値を `{ ok:true, data }` でラップするため、
 * 呼び出し元は 2 段階読みを行う（stop-capture.ts と同じパターン）。
 */
export const pauseCapture = authedAction(
  pauseCaptureSchema,
  async ({ sessionId }, { userId }) => {
    return transitionCapture(sessionId, userId, 'paused');
  },
);

// ---------------------------------------------------------------------------
// resumeCapture アクション（paused → recording）
// ---------------------------------------------------------------------------

/**
 * 一時停止中のキャプチャを再開する Server Action。
 *
 * 成功時: `{ ok:true, data:{ captureStatus:'recording' } }`
 * 失敗時（遷移不可）: `{ ok:false, error:{ code:'INVALID_STATE_TRANSITION', ... } }`
 *
 * 再開時に last_capture_event_at を now にリセットすることで、
 * 一時停止中に蓄積した経過時間で staleTranscript が即座に true になるのを防ぐ。
 */
export const resumeCapture = authedAction(
  pauseCaptureSchema,
  async ({ sessionId }, { userId }) => {
    return transitionCapture(sessionId, userId, 'recording', {
      last_capture_event_at: new Date(),
    });
  },
);

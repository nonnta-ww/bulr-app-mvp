'use server';

/**
 * startCapture — キャプチャ開始 Server Action（CaptureOrchestrator の開始半分）
 *
 * 責務:
 *  - 同意ゲート（consent_obtained_at 非 null チェック）— Req 1.6, 7.5
 *  - セッション所有権チェック（interviewer_id === userId）— Req 7.1
 *  - recall モード: createBot 呼び出し → bot_joining 遷移 — Req 1.1, 1.3, 2.4
 *  - mic モード: recording 遷移 — Req 1.5
 *  - 開始成功時に status='in_progress' / started_at 設定 — Req 1.7
 *  - createBot 失敗時に capture_status='failed' + retryable/canSwitchToMic フラグ返却 — Req 1.4
 *
 * 環境変数:
 *  - BUSINESS_BASE_URL        — transcript webhook の baseUrl（サーバー専用）
 *  - NEXT_PUBLIC_APP_URL      — BUSINESS_BASE_URL が未設定の場合のフォールバック
 *  - RECALL_API_KEY           — Recall API キー（サーバー専用・ログ出力禁止）
 *  - RECALL_API_BASE_URL      — Recall API リージョン別ベース URL
 *  - RECALL_WEBHOOK_SECRET    — transcript webhook URL トークン発行用
 *  - CAPTURE_TRANSCRIPT_PROVIDER — STT プロバイダ（既定: deepgram_streaming）
 *
 * env 選択理由（BUSINESS_BASE_URL vs NEXT_PUBLIC_APP_URL）:
 *  transcript webhook URL はサーバー側でのみ構築される。BUSINESS_BASE_URL は
 *  NEXT_PUBLIC_ プレフィックスを持たないため Client バンドルに公開されない。
 *  NEXT_PUBLIC_APP_URL はサーバーでも利用可能だが、BUSINESS_BASE_URL を優先する
 *  ことで「サーバー専用の URL 設定」と「クライアント公開 URL 設定」を明確に分離する。
 *
 * Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 5.1, 7.1, 7.5
 * Design: CaptureOrchestrator (Service Interface, Responsibilities & Constraints)
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { authedAction, requireSessionOwnership } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { interviewSession } from '@bulr/db/schema';

import { createRecallClient, meetingUrlSchema } from '../../../../../lib/capture/recall-client';
import {
  issueTranscriptToken,
  buildTranscriptWebhookUrl,
} from '../../../../../lib/capture/recall-webhook-verify';
import { canTransition, type CaptureStatus } from '../../../../../lib/capture/capture-status';

// ---------------------------------------------------------------------------
// 入力スキーマ（Zod）
// ---------------------------------------------------------------------------

// Fix 2: meetingUrl の URL フォーマット検証を入力スキーマ境界で行う（Req 1.2, 7.2）。
// recall-client.ts がエクスポートする meetingUrlSchema（Zoom / Meet / Teams 正規表現）を
// 再利用することで検証ロジックの重複を排除する。
const startCaptureSchema = z.object({
  sessionId: z.string().min(1),
  mode: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('recall'),
      // meetingUrlSchema: Zoom / Google Meet / Microsoft Teams の URL 形式を検証
      meetingUrl: meetingUrlSchema,
    }),
    z.object({
      kind: z.literal('mic'),
    }),
  ]),
});

// ---------------------------------------------------------------------------
// startCapture アクション
// ---------------------------------------------------------------------------

/**
 * キャプチャ開始 Server Action。
 *
 * 成功時 (recall): `{ ok:true, data:{ captureStatus:'bot_joining', botId } }`
 * 成功時 (mic):    `{ ok:true, data:{ captureStatus:'recording' } }`
 * 失敗時（業務ルール）: `{ ok:false, error:{ code, message, retryable?, canSwitchToMic? } }`
 * 失敗時（認証・所有権）: authedAction 外層で `{ ok:false, error:{ code:'FORBIDDEN', ... } }`
 *
 * 注意: authedAction は handler の戻り値を `{ ok:true, data }` でラップするため、
 * 呼び出し元は 2 段階読みを行う:
 *   `result.data.ok` — 業務ロジックの成否
 *   `result.ok`      — 認証 / 入力バリデーションの成否
 */
export const startCapture = authedAction(
  startCaptureSchema,
  async ({ sessionId, mode }, { userId }) => {
    // -----------------------------------------------------------------------
    // 1. セッション取得
    // -----------------------------------------------------------------------
    const session = await db.query.interviewSession.findFirst({
      where: eq(interviewSession.id, sessionId),
    });

    // -----------------------------------------------------------------------
    // 2. 所有権チェック（Req 7.1）
    //    セッションが存在しない場合は AuthError('NOT_FOUND')、
    //    interviewer_id 不一致は AuthError('FORBIDDEN') を throw。
    //    いずれも authedAction 外層が捕捉し { ok:false, error } を返す。
    // -----------------------------------------------------------------------
    requireSessionOwnership(
      session ? { interviewerId: session.interviewer_id } : null,
      userId,
    );

    // requireSessionOwnership が throw しないならセッションは非 null
    const sess = session!;

    // -----------------------------------------------------------------------
    // 3. 同意ゲート（Req 1.6, 7.5）
    //    consent_obtained_at が null の場合は開始を拒否する。
    //    consent カラムへの書き込みは行わない（7.5 の不変条件）。
    // -----------------------------------------------------------------------
    if (sess.consent_obtained_at === null) {
      return {
        ok: false as const,
        error: {
          code: 'CONSENT_REQUIRED',
          message: '同意の記録がないためキャプチャを開始できません',
        },
      };
    }

    const currentStatus = sess.capture_status as CaptureStatus;

    // -----------------------------------------------------------------------
    // 4a. recall モード（Req 1.1, 1.3, 2.4）
    //
    // 状態遷移順序（state machine 準拠）:
    //   currentStatus → bot_joining（参加試行開始時点で遷移） → failed / recording
    //
    // 同意・所有権チェックは bot_joining 書き込みよりも前に完了済み（手順 2〜3）。
    // createBot が失敗した場合も bot_joining を経由させることで、
    // 遷移グラフ（capture-status.ts）の定義どおり idle/failed → bot_joining → failed が保証される。
    // -----------------------------------------------------------------------
    if (mode.kind === 'recall') {
      // ステップ 1: 遷移ガード（currentStatus → bot_joining が許可されているか確認）
      // これが失敗するケース: 既にアクティブな状態（bot_joining/recording/stopping）
      if (!canTransition(currentStatus, 'bot_joining')) {
        return {
          ok: false as const,
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `現在の状態 (${currentStatus}) からキャプチャを開始できません`,
          },
        };
      }

      // ステップ 2: bot_joining へ先行遷移（Req 1.7: 参加試行開始時点で in_progress + started_at 設定）
      // createBot を呼ぶ前にこの遷移を DB へ書き込む。
      // これにより失敗時の bot_joining → failed も遷移グラフに沿う。
      await db
        .update(interviewSession)
        .set({
          capture_provider: 'recall',
          capture_status: 'bot_joining',
          status: 'in_progress',
          // started_at が未設定の場合のみ now() を設定（冪等性）
          started_at: sess.started_at ?? new Date(),
          updated_at: new Date(),
        })
        .where(eq(interviewSession.id, sessionId));

      // ステップ 3: transcript webhook URL の構築（Req 7.2: URL トークンによる認証）
      const token = issueTranscriptToken({ sessionId });
      const appBaseUrl =
        process.env.BUSINESS_BASE_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        '';
      const transcriptWebhookBase = `${appBaseUrl}/api/webhooks/recall/transcript`;
      const webhookUrl = buildTranscriptWebhookUrl(transcriptWebhookBase, token);

      // ステップ 4: ボット作成（Req 1.1, 1.3）
      const recallClient = createRecallClient();
      const createBotResult = await recallClient.createBot({
        meetingUrl: mode.meetingUrl,
        // Req 1.3: 記録中であることが会議参加者に識別できる名称
        botName: 'bulr 記録ボット',
        // Req 2.4: CAPTURE_TRANSCRIPT_PROVIDER で STT プロバイダを切り替え可能
        transcriptProvider:
          process.env.CAPTURE_TRANSCRIPT_PROVIDER ?? 'deepgram_streaming',
        webhookBaseUrl: webhookUrl,
        metadata: { sessionId },
      });

      if (!createBotResult.ok) {
        // Req 1.4: ボット参加失敗時は bot_joining → failed へ遷移し、UI に再試行 / 対面切替を提示。
        // canTransition('bot_joining', 'failed') は capture-status.ts で定義済み（常に true）。
        // この guard により遷移グラフを迂回しない。
        if (!canTransition('bot_joining', 'failed')) {
          // 防御コード: 遷移マップが変更された場合の安全網（実運用では到達しない）
          throw new Error('capture_status transition not allowed: bot_joining → failed');
        }

        await db
          .update(interviewSession)
          .set({
            capture_status: 'failed',
            updated_at: new Date(),
          })
          .where(eq(interviewSession.id, sessionId));

        return {
          ok: false as const,
          error: {
            code: createBotResult.error.code,
            message:
              createBotResult.error.code === 'invalid_meeting_url'
                ? '会議 URL が無効です'
                : '録音ボットが会議に参加できませんでした',
            // Req 1.4: UI が再試行 / 対面切替を提示するためのフラグ
            retryable: true,
            canSwitchToMic: true,
          },
        };
      }

      const { botId } = createBotResult.value;

      // ステップ 5: 成功時は bot_id を設定（capture_status は既に bot_joining / Req 1.7）
      await db
        .update(interviewSession)
        .set({
          bot_id: botId,
          updated_at: new Date(),
        })
        .where(eq(interviewSession.id, sessionId));

      return {
        ok: true as const,
        data: { captureStatus: 'bot_joining' as const, botId },
      };
    }

    // -----------------------------------------------------------------------
    // 4b. mic モード（Req 1.5）
    // -----------------------------------------------------------------------
    // 遷移ガード（recording への遷移が許可されているか確認）
    if (!canTransition(currentStatus, 'recording')) {
      return {
        ok: false as const,
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `現在の状態 (${currentStatus}) からキャプチャを開始できません`,
        },
      };
    }

    await db
      .update(interviewSession)
      .set({
        capture_provider: 'mic',
        capture_status: 'recording',
        status: 'in_progress',
        // started_at が未設定の場合のみ now() を設定
        started_at: sess.started_at ?? new Date(),
        updated_at: new Date(),
      })
      .where(eq(interviewSession.id, sessionId));

    return {
      ok: true as const,
      data: { captureStatus: 'recording' as const },
    };
  },
);

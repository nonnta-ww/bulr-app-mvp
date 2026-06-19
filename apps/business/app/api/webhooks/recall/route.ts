/**
 * POST /api/webhooks/recall — Recall.ai bot status イベント受信ルート。
 *
 * ボット状態の変化（参加中/録音開始/終了/失敗）を受け取り、
 * interview_session.capture_status を定義済み遷移に従って更新する。
 *
 * 設計方針（design.md: WebhookIngestion）:
 * - 応答は常に即時 200（認証失敗は 401、payload 不正は 400）
 * - sessionId ↔ bot_id DB 突合不一致は 200 + 破棄（再配信ループ防止）
 * - aborted セッションのイベントは破棄（Req 7.6）
 * - at-least-once 再配信前提: 許可されない遷移は no-op（防御的）
 * - Stage 1 モニタリング: 構造化 console ログ（Vercel ログ確認運用）
 *
 * Requirements: 1.4, 5.2, 7.6
 * Design: WebhookIngestion API Contract / Event Contract / Error Handling / Monitoring
 */

import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { verifyStatusSignature } from '../../../../lib/capture/recall-webhook-verify';
import { canTransition, type CaptureStatus } from '../../../../lib/capture/capture-status';
import { finalizeSession } from '../../../../lib/capture/finalize-session';

// ---------------------------------------------------------------------------
// Zod スキーマ: Recall status webhook payload
//
// 購読対象: bot.in_call_recording / bot.fatal / bot.call_ended / bot.done
// Recall は metadata を createBot 時に渡した値そのままで返す。
// recall-client.ts では `metadata: { session_id: input.metadata.sessionId }` で送信しているため
// webhook payload 内も snake_case（session_id）になる。
// ---------------------------------------------------------------------------

const StatusEventPayloadSchema = z.object({
  event: z.string(),
  data: z.object({
    bot: z.object({
      id: z.string(),
      metadata: z.object({
        session_id: z.string(),
      }),
      sub_code: z.string().optional().nullable(),
    }),
  }),
});

/** 購読しているイベント種別 */
const SUBSCRIBED_EVENTS = new Set([
  'bot.in_call_recording',
  'bot.fatal',
  'bot.call_ended',
  'bot.done',
] as const);

// ---------------------------------------------------------------------------
// finalize フック（task 7.1 で結線済み）
//
// bot.call_ended / bot.done 受信時にサーバー起点で finalizeSession を呼ぶ。
// fire-and-forget（void 呼び出し）— finalize の失敗は Webhook の 200 応答に影響しない。
// at-least-once 再配信: 失敗しても次の redelivery で再試行される（設計原則）。
//
// Requirements: 5.2（会議終了検知 → 自動停止 + 通知）
// Design: FinalizeExtension（会議終了検知時は同じ処理をサーバー起点で実行）
// ---------------------------------------------------------------------------

async function triggerFinalizeOnCallEnded(
  sessionId: string,
  interviewerId: string,
): Promise<void> {
  try {
    console.info(
      `[webhook/recall] finalize triggered by call_ended: sessionId=${sessionId}`,
    );
    const result = await finalizeSession({ sessionId, userId: interviewerId });
    if (result.ok) {
      console.info(
        `[webhook/recall] finalize completed: sessionId=${sessionId}`,
      );
    } else {
      console.error(
        `[webhook/recall] finalize failed: ` +
          `sessionId=${sessionId}, error=${result.error}`,
      );
    }
  } catch (e) {
    // 想定外の例外も吸収してWebhookの200応答を守る（best-effort）
    console.error(
      `[webhook/recall] finalize threw unexpectedly (webhook still returns 200): ` +
        `sessionId=${sessionId}`,
      e,
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // ------------------------------------------------------------------
  // 1. Raw body 取得 — 署名検証に生ボディ文字列が必要なため JSON.parse より前に取得
  // ------------------------------------------------------------------
  const rawBody = await request.text();

  // ------------------------------------------------------------------
  // 2. Svix 署名検証（失敗 → 401）
  //    design.md: "webhook auth fail → 401"
  // ------------------------------------------------------------------
  const svixId = request.headers.get('svix-id') ?? undefined;
  const svixTimestamp = request.headers.get('svix-timestamp') ?? undefined;
  const svixSignature = request.headers.get('svix-signature') ?? undefined;

  const signatureValid = verifyStatusSignature({
    headers: {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    },
    rawBody,
  });

  if (!signatureValid) {
    console.warn('[webhook/recall] signature verification failed');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ------------------------------------------------------------------
  // 3. JSON パース
  // ------------------------------------------------------------------
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400 },
    );
  }

  // ------------------------------------------------------------------
  // 4. Zod バリデーション（payload 不正 → 400）
  //    design.md: "payload mismatch → 200 + discard" は sessionId/bot_id 不一致の話。
  //    完全な payload 形式不備は 400 を返す。
  // ------------------------------------------------------------------
  const result = StatusEventPayloadSchema.safeParse(parsedJson);
  if (!result.success) {
    console.warn('[webhook/recall] payload schema validation failed', result.error.flatten());
    return NextResponse.json(
      { error: 'validation_failed', details: result.error.flatten() },
      { status: 400 },
    );
  }

  const { event, data: { bot } } = result.data;
  const { id: botId, metadata: { session_id: sessionId }, sub_code: subCode } = bot;

  // ------------------------------------------------------------------
  // 5. 未購読イベント → no-op 200
  // ------------------------------------------------------------------
  if (!SUBSCRIBED_EVENTS.has(event as Parameters<typeof SUBSCRIBED_EVENTS.has>[0])) {
    console.info(`[webhook/recall] unsubscribed event ignored: event=${event}`);
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // 6. DB 突合: sessionId で interview_session を取得し bot_id を照合
  //    不一致 / 未存在 → 200 + 破棄（再配信ループ防止）
  //    design.md: "metadata.sessionId と bot_id の DB 紐付けが一致しない場合は破棄"
  // ------------------------------------------------------------------
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, sessionId),
  });

  if (!session || session.bot_id !== botId) {
    console.warn(
      `[webhook/recall] session/bot mismatch or not found: ` +
        `sessionId=${sessionId}, botId=${botId}, ` +
        `stored_bot_id=${session?.bot_id ?? 'N/A'}`,
    );
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // 7. aborted / paused セッションのイベントは破棄
  //    - aborted: 中止後の受理拒否（Req 7.6, design.md: "aborted セッションのイベントは破棄"）
  //    - paused:  一時停止中は bot status イベントを受理しない。特に再配信された
  //               bot.in_call_recording が paused→recording 遷移（再開）を満たして
  //               しまうため、勝手に再開されるのを防ぐ。再開はユーザー操作のみ。
  // ------------------------------------------------------------------
  if (session.capture_status === 'aborted' || session.capture_status === 'paused') {
    console.info(
      `[webhook/recall] event discarded for ${session.capture_status} session: sessionId=${sessionId}, event=${event}`,
    );
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // 8. status 遷移
  //    at-least-once 再配信と並行着弾に備え、canTransition が false なら no-op
  //    （assertTransition による throw は使わない — 防御的運用）
  // ------------------------------------------------------------------
  const currentStatus = session.capture_status as CaptureStatus;

  if (event === 'bot.in_call_recording') {
    // Req 1.4, design: bot.in_call_recording → recording
    const target: CaptureStatus = 'recording';
    if (!canTransition(currentStatus, target)) {
      console.warn(
        `[webhook/recall] transition not allowed: ${currentStatus} → ${target}, ` +
          `sessionId=${sessionId} (event=${event}, redelivery likely)`,
      );
      return NextResponse.json({ ok: true });
    }
    await db
      .update(schema.interviewSession)
      .set({ capture_status: target, last_capture_event_at: new Date() })
      .where(eq(schema.interviewSession.id, sessionId));

    console.info(
      `[webhook/recall] status transitioned: ${currentStatus} → ${target}, sessionId=${sessionId}`,
    );

  } else if (event === 'bot.fatal') {
    // Req 1.4, design: bot.fatal → failed
    const target: CaptureStatus = 'failed';
    if (!canTransition(currentStatus, target)) {
      console.warn(
        `[webhook/recall] transition not allowed: ${currentStatus} → ${target}, ` +
          `sessionId=${sessionId} (event=${event}, redelivery likely)`,
      );
      return NextResponse.json({ ok: true });
    }

    // Stage 1 モニタリング: 失敗理由は DB カラムなし（設計上意図的）→ 構造化ログで記録
    // design.md: "Monitoring: Stage 1 = structured console logs"
    console.error(
      `[webhook/recall] bot.fatal received: ` +
        `sessionId=${sessionId}, botId=${botId}, sub_code=${subCode ?? 'unknown'} ` +
        `— setting capture_status=failed`,
    );

    await db
      .update(schema.interviewSession)
      .set({ capture_status: target, last_capture_event_at: new Date() })
      .where(eq(schema.interviewSession.id, sessionId));

  } else if (event === 'bot.call_ended' || event === 'bot.done') {
    // Req 5.2, design: bot.call_ended / bot.done → stopped + 終了通知フラグ
    const target: CaptureStatus = 'stopped';
    if (!canTransition(currentStatus, target)) {
      console.warn(
        `[webhook/recall] transition not allowed: ${currentStatus} → ${target}, ` +
          `sessionId=${sessionId} (event=${event}, redelivery likely)`,
      );
      return NextResponse.json({ ok: true });
    }

    // capture_status=stopped が終了通知フラグを兼ねる（live-state 経由で UI 通知）
    // last_capture_event_at を更新することで staleTranscript 判定もリセットされる
    await db
      .update(schema.interviewSession)
      .set({ capture_status: target, last_capture_event_at: new Date() })
      .where(eq(schema.interviewSession.id, sessionId));

    console.info(
      `[webhook/recall] status transitioned: ${currentStatus} → ${target}, ` +
        `sessionId=${sessionId} (event=${event})`,
    );

    // fire-and-forget: finalize の完了を待たずに即時 200 を返す（design.md: at-least-once）
    void triggerFinalizeOnCallEnded(sessionId, session.interviewer_id);
  }

  // ------------------------------------------------------------------
  // 9. 常に即時 200 を返す
  //    design.md: "応答は常に即時 200"
  // ------------------------------------------------------------------
  return NextResponse.json({ ok: true });
}

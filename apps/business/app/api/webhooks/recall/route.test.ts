/**
 * POST /api/webhooks/recall の統合テスト（DB バックド）。
 *
 * - 実際の Docker Postgres に対して seed/teardown を行う
 * - Svix 署名の正規構築・不正検証を含む
 * - 各イベント種別の capture_status 遷移と副作用なし破棄を検証する
 *
 * Requirements: 1.4, 5.2, 7.6
 * Design: WebhookIngestion (API Contract / Event Contract / Implementation Notes)
 */

// `server-only` はNext.jsビルド時専用の副作用パッケージ。
// vitest Node環境では空モックに置換する。
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { POST } from './route';

// ---------------------------------------------------------------------------
// ヘルパー: Svix 署名の構築（recall-webhook-verify.test.ts と同一アルゴリズム）
// ---------------------------------------------------------------------------

function buildSvixSecret(): { rawKey: Buffer; envSecret: string } {
  const rawKey = randomBytes(32);
  const envSecret = `whsec_${rawKey.toString('base64')}`;
  return { rawKey, envSecret };
}

function signSvix(
  rawKey: Buffer,
  opts: { svixId: string; svixTimestamp: string; rawBody: string },
): string {
  const signedContent = `${opts.svixId}.${opts.svixTimestamp}.${opts.rawBody}`;
  return createHmac('sha256', rawKey).update(signedContent).digest('base64');
}

/** 署名付き POST Request を構築する */
function makeSignedRequest(body: unknown, rawKey: Buffer): Request {
  const rawBody = JSON.stringify(body);
  const svixId = `msg_${crypto.randomUUID()}`;
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const sig = signSvix(rawKey, { svixId, svixTimestamp, rawBody });

  return new Request('https://example.com/api/webhooks/recall', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,${sig}`,
    },
    body: rawBody,
  });
}

/** 署名なしの POST Request を構築する（401 検証用） */
function makeUnsignedRequest(body: unknown): Request {
  const rawBody = JSON.stringify(body);
  return new Request('https://example.com/api/webhooks/recall', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });
}

// ---------------------------------------------------------------------------
// 標準 Recall status webhook payload の構築ヘルパー
// ---------------------------------------------------------------------------

function makeStatusPayload(
  event: string,
  botId: string,
  sessionId: string,
  extra?: Record<string, unknown>,
): object {
  return {
    event,
    data: {
      bot: {
        id: botId,
        metadata: { session_id: sessionId },
        sub_code: null,
        ...extra,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/recall', () => {
  let rawKey: Buffer;
  let userId: string;
  let sessionId: string;
  let botId: string;

  beforeEach(async () => {
    const { rawKey: key, envSecret } = buildSvixSecret();
    rawKey = key;
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();
    botId = `bot-${crypto.randomUUID()}`;

    // Better Auth ユーザーを挿入（FK 参照元）
    await db.insert(schema.user).values({
      id: userId,
      email: `test-${userId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // FK 制約に従い session → user の順で削除
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  /** テスト用セッションを指定ステータスで作成するヘルパー */
  async function seedSession(captureStatus: string): Promise<void> {
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: userId,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: captureStatus as typeof schema.interviewSession.$inferInsert['capture_status'],
      bot_id: botId,
    });
  }

  /** DB から最新の capture_status を読み取るヘルパー */
  async function readCaptureStatus(): Promise<string | null | undefined> {
    const row = await db.query.interviewSession.findFirst({
      where: eq(schema.interviewSession.id, sessionId),
    });
    return row?.capture_status;
  }

  // -------------------------------------------------------------------------
  // (a) bot.in_call_recording → recording 遷移
  // -------------------------------------------------------------------------
  it('(a) bot.in_call_recording: bot_joining → recording に遷移する', async () => {
    await seedSession('bot_joining');

    const body = makeStatusPayload('bot.in_call_recording', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('recording');
  });

  // -------------------------------------------------------------------------
  // (b) bot.fatal → failed 遷移
  // -------------------------------------------------------------------------
  it('(b) bot.fatal: recording → failed に遷移する', async () => {
    await seedSession('recording');

    const body = makeStatusPayload('bot.fatal', botId, sessionId, {
      sub_code: 'failed_to_join',
    });
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('failed');
  });

  // -------------------------------------------------------------------------
  // (c) bot.call_ended → stopped 遷移
  // -------------------------------------------------------------------------
  it('(c) bot.call_ended: recording → stopped に遷移する', async () => {
    await seedSession('recording');

    const body = makeStatusPayload('bot.call_ended', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('stopped');
  });

  // -------------------------------------------------------------------------
  // (c-2) bot.done → stopped 遷移（bot.done も同じ停止イベント）
  // -------------------------------------------------------------------------
  it('(c-2) bot.done: recording → stopped に遷移する', async () => {
    await seedSession('recording');

    const body = makeStatusPayload('bot.done', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('stopped');
  });

  // -------------------------------------------------------------------------
  // (d) 不正署名 → 401、DB 変更なし
  // -------------------------------------------------------------------------
  it('(d) 不正署名: 401 を返し DB を変更しない', async () => {
    await seedSession('bot_joining');

    const body = makeStatusPayload('bot.in_call_recording', botId, sessionId);
    const req = makeUnsignedRequest(body);
    const res = await POST(req);

    expect(res.status).toBe(401);
    // capture_status は変わらず bot_joining のまま
    expect(await readCaptureStatus()).toBe('bot_joining');
  });

  // -------------------------------------------------------------------------
  // (e) sessionId/bot_id 不一致 → 200、DB 変更なし
  // -------------------------------------------------------------------------
  it('(e) bot_id 不一致: 200 を返し DB を変更しない', async () => {
    await seedSession('bot_joining');

    const wrongBotId = `bot-${crypto.randomUUID()}`;
    const body = makeStatusPayload('bot.in_call_recording', wrongBotId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('bot_joining');
  });

  // -------------------------------------------------------------------------
  // (e-2) sessionId が DB に存在しない → 200、DB 変更なし（セッション未挿入）
  // -------------------------------------------------------------------------
  it('(e-2) 存在しない sessionId: 200 を返し副作用なし', async () => {
    const unknownSessionId = crypto.randomUUID();
    const body = makeStatusPayload('bot.in_call_recording', botId, unknownSessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    // sessionId に対応する行は存在しないことを確認
    const row = await db.query.interviewSession.findFirst({
      where: eq(schema.interviewSession.id, unknownSessionId),
    });
    expect(row).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // (f) aborted セッション → 200、status は aborted のまま
  // -------------------------------------------------------------------------
  it('(f) aborted セッション: 200 を返し status を変更しない', async () => {
    await seedSession('aborted');

    const body = makeStatusPayload('bot.in_call_recording', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('aborted');
  });

  // -------------------------------------------------------------------------
  // (g) 未購読イベント型 → 200、DB 変更なし
  // -------------------------------------------------------------------------
  it('(g) 未購読イベント: 200 を返し DB を変更しない', async () => {
    await seedSession('bot_joining');

    const body = makeStatusPayload('bot.joining', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('bot_joining');
  });

  // -------------------------------------------------------------------------
  // 追加: 不正 JSON → 400
  // -------------------------------------------------------------------------
  it('malformed JSON: 400 を返す', async () => {
    const rawBody = 'not-json{{{';
    const svixId = `msg_${crypto.randomUUID()}`;
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const sig = signSvix(rawKey, { svixId, svixTimestamp, rawBody });

    const req = new Request('https://example.com/api/webhooks/recall', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${sig}`,
      },
      body: rawBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 追加: last_capture_event_at が更新される
  // -------------------------------------------------------------------------
  it('イベント受理後に last_capture_event_at が更新される', async () => {
    await seedSession('bot_joining');

    const before = new Date();
    const body = makeStatusPayload('bot.in_call_recording', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    await POST(req);

    const row = await db.query.interviewSession.findFirst({
      where: eq(schema.interviewSession.id, sessionId),
    });
    expect(row?.last_capture_event_at).not.toBeNull();
    expect(row?.last_capture_event_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // -------------------------------------------------------------------------
  // 追加: 許可されない遷移は no-op 200（冪等性 / at-least-once 再配信）
  // -------------------------------------------------------------------------
  it('許可されない遷移（stopped → recording）: 200 を返し status を変更しない', async () => {
    await seedSession('stopped');

    const body = makeStatusPayload('bot.in_call_recording', botId, sessionId);
    const req = makeSignedRequest(body, rawKey);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await readCaptureStatus()).toBe('stopped');
  });
});

/**
 * POST /api/webhooks/recall/transcript の統合テスト（DB バックド）。
 *
 * - 実際の Docker Postgres に対して seed/teardown を行う
 * - URL トークン認証・Zod 検証・冪等 insert・話者ラベル付与を検証する
 * - 重複配信で 1 行のままになること（headline acceptance）を含む
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5
 * Design: WebhookIngestion API Contract / Event Contract / Testing Strategy Integration Tests #1
 */

// `server-only` はNext.jsビルド時専用の副作用パッケージ。
// vitest Node環境では空モックに置換する。
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { issueTranscriptToken } from '../../../../../lib/capture/recall-webhook-verify';
import { POST } from './route';

// ---------------------------------------------------------------------------
// ヘルパー: リクエスト構築
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, token: string): Request {
  return new Request(
    `https://example.com/api/webhooks/recall/transcript?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/**
 * 標準的な transcript.data payload を構築するヘルパー。
 * is_final のデフォルトは true（最終セグメント）。
 */
function makeTranscriptPayload(opts: {
  botId: string;
  participantName?: string | null;
  participantId?: string | null;
  text?: string;
  isFinal?: boolean;
  startTime?: number;
  endTime?: number;
  event?: string;
}): object {
  return {
    event: opts.event ?? 'transcript.data',
    data: {
      bot_id: opts.botId,
      transcript: {
        text: opts.text ?? 'テスト発話テキスト',
        participant: {
          id: opts.participantId ?? 'participant-1',
          name: opts.participantName ?? '参加者',
        },
        is_final: opts.isFinal ?? true,
        start_time: opts.startTime ?? 1000.0,
        end_time: opts.endTime ?? 1005.0,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/recall/transcript', () => {
  let userId: string;
  let sessionId: string;
  let botId: string;
  let token: string;

  beforeEach(async () => {
    // 各テストでユニークな ID + テスト用シークレットを設定
    vi.stubEnv('RECALL_WEBHOOK_SECRET', 'test-webhook-secret');

    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();
    botId = `bot-${crypto.randomUUID()}`;
    token = issueTranscriptToken({ sessionId });

    // Better Auth ユーザー（面接官）を挿入
    await db.insert(schema.user).values({
      id: userId,
      email: `test-${userId}@example.com`,
      emailVerified: false,
      name: '面接官 太郎',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // FK 制約に従い segments → session → user の順で削除
    await db
      .delete(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  /** テスト用セッションを 'recording' 状態で作成するヘルパー */
  async function seedSession(
    overrides: Partial<typeof schema.interviewSession.$inferInsert> = {},
  ): Promise<void> {
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: userId,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'recording',
      bot_id: botId,
      // Unix epoch をセッション開始時刻とすることで、start_time(秒) → started_at_ms(ms) の計算が単純になる
      started_at: new Date(0),
      ...overrides,
    });
  }

  /** session_id に対応する transcript_segment の件数を返すヘルパー */
  async function countSegments(): Promise<number> {
    const [row] = await db
      .select({ c: count() })
      .from(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    return Number(row?.c ?? 0);
  }

  // -------------------------------------------------------------------------
  // (a) 面接官の final transcript.data → 1 セグメント挿入、speaker_role=interviewer、
  //     text 正しい、last_capture_event_at 更新
  // -------------------------------------------------------------------------
  it('(a) 面接官の final transcript.data → 1 セグメント挿入・interviewer ラベル・last_capture_event_at 更新', async () => {
    await seedSession();
    const before = new Date();

    const body = makeTranscriptPayload({
      botId,
      participantName: '面接官 太郎',
      text: '今日はよろしくお願いします',
      startTime: 100.0,
      endTime: 105.0,
    });
    const req = makeRequest(body, token);
    const res = await POST(req);

    expect(res.status).toBe(200);

    // 1 行挿入されていること
    const segments = await db.query.transcriptSegment.findMany({
      where: eq(schema.transcriptSegment.session_id, sessionId),
    });
    expect(segments).toHaveLength(1);

    const seg = segments[0]!;
    expect(seg.speaker_role).toBe('interviewer');
    expect(seg.text).toBe('今日はよろしくお願いします');
    expect(seg.speaker_label).toBe('面接官 太郎');
    expect(seg.origin).toBe('bot_realtime');

    // last_capture_event_at が更新されていること
    const session = await db.query.interviewSession.findFirst({
      where: eq(schema.interviewSession.id, sessionId),
    });
    expect(session?.last_capture_event_at).not.toBeNull();
    expect(session!.last_capture_event_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // -------------------------------------------------------------------------
  // (b) 同一イベント二重投入 → 1 行のまま（冪等性 / headline acceptance）
  // -------------------------------------------------------------------------
  it('(b) 同一イベント二重投入 → 1 行のまま（冪等性）', async () => {
    await seedSession();

    const body = makeTranscriptPayload({
      botId,
      participantName: '面接官 太郎',
      text: '同一イベントのテスト',
      startTime: 200.0,
      endTime: 205.0,
    });

    // 1 回目
    const res1 = await POST(makeRequest(body, token));
    expect(res1.status).toBe(200);

    // 2 回目（同一ペイロード）
    const res2 = await POST(makeRequest(body, token));
    expect(res2.status).toBe(200);

    // HEADLINE: source_id が同じ → 行数は 1 のまま
    expect(await countSegments()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // (c-1) 候補者名参加者 → speaker_role=candidate
  // -------------------------------------------------------------------------
  it('(c-1) 候補者の参加者名 → speaker_role=candidate', async () => {
    await seedSession();

    const body = makeTranscriptPayload({
      botId,
      participantName: '候補者 花子',
      text: 'バックエンドに興味があります',
      startTime: 300.0,
      endTime: 305.0,
    });
    const res = await POST(makeRequest(body, token));

    expect(res.status).toBe(200);

    const segments = await db.query.transcriptSegment.findMany({
      where: eq(schema.transcriptSegment.session_id, sessionId),
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]!.speaker_role).toBe('candidate');
  });

  // -------------------------------------------------------------------------
  // (c-2) 参加者名なし → speaker_role=unknown
  // -------------------------------------------------------------------------
  it('(c-2) 参加者名なし → speaker_role=unknown', async () => {
    await seedSession();

    const body = {
      event: 'transcript.data',
      data: {
        bot_id: botId,
        transcript: {
          text: '聞き取れない発話',
          participant: { id: null, name: null },
          is_final: true,
          start_time: 400.0,
          end_time: 405.0,
        },
      },
    };
    const res = await POST(makeRequest(body, token));

    expect(res.status).toBe(200);

    const segments = await db.query.transcriptSegment.findMany({
      where: eq(schema.transcriptSegment.session_id, sessionId),
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]!.speaker_role).toBe('unknown');
  });

  // -------------------------------------------------------------------------
  // (d) 不正トークン → 401、セグメント挿入なし
  // -------------------------------------------------------------------------
  it('(d) 不正トークン → 401・セグメント挿入なし', async () => {
    await seedSession();

    const res = await POST(
      makeRequest(makeTranscriptPayload({ botId }), 'invalid-token'),
    );

    expect(res.status).toBe(401);
    expect(await countSegments()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // (e) session/bot_id 不一致 → 200、セグメント挿入なし
  // -------------------------------------------------------------------------
  it('(e) bot_id 不一致 → 200・セグメント挿入なし', async () => {
    await seedSession();

    const wrongBotId = `bot-wrong-${crypto.randomUUID()}`;
    const body = makeTranscriptPayload({ botId: wrongBotId });
    const res = await POST(makeRequest(body, token));

    expect(res.status).toBe(200);
    expect(await countSegments()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // (f) partial イベント → 200、セグメント挿入なし
  // -------------------------------------------------------------------------
  it('(f-1) is_final=false → 200・セグメント挿入なし', async () => {
    await seedSession();

    const body = makeTranscriptPayload({ botId, isFinal: false });
    const res = await POST(makeRequest(body, token));

    expect(res.status).toBe(200);
    expect(await countSegments()).toBe(0);
  });

  it('(f-2) event=transcript.partial_data → 200・セグメント挿入なし', async () => {
    await seedSession();

    const body = makeTranscriptPayload({
      botId,
      event: 'transcript.partial_data',
      isFinal: true, // even if is_final=true, partial_data event is discarded
    });
    const res = await POST(makeRequest(body, token));

    expect(res.status).toBe(200);
    expect(await countSegments()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // (g) 2 つの異なる source_id → 2 行、seq が別々
  // -------------------------------------------------------------------------
  it('(g) 異なる 2 つの source_id → 2 行・seq が異なる', async () => {
    await seedSession();

    // 異なる start_time（= 異なる source_id）の 2 イベント
    await POST(
      makeRequest(
        makeTranscriptPayload({
          botId,
          participantName: '面接官 太郎',
          text: '1つ目の発話',
          startTime: 500.0,
          endTime: 505.0,
        }),
        token,
      ),
    );
    await POST(
      makeRequest(
        makeTranscriptPayload({
          botId,
          participantName: '候補者 花子',
          text: '2つ目の発話',
          startTime: 510.0,
          endTime: 515.0,
        }),
        token,
      ),
    );

    const segments = await db.query.transcriptSegment.findMany({
      where: eq(schema.transcriptSegment.session_id, sessionId),
    });
    expect(segments).toHaveLength(2);

    // seq は一意であること（順序は到着順）
    const seqs = segments.map(s => s.seq);
    expect(new Set(seqs).size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 追加: aborted セッション → 200、セグメント挿入なし（Req 7.6）
  // -------------------------------------------------------------------------
  it('aborted セッション → 200・セグメント挿入なし', async () => {
    await seedSession({ capture_status: 'aborted' });

    const body = makeTranscriptPayload({ botId });
    const res = await POST(makeRequest(body, token));

    expect(res.status).toBe(200);
    expect(await countSegments()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 追加: malformed JSON → 400
  // -------------------------------------------------------------------------
  it('malformed JSON → 400', async () => {
    const req = new Request(
      `https://example.com/api/webhooks/recall/transcript?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-valid-json{{{',
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

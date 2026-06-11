/**
 * recall-client.ts の単体テスト。
 *
 * fetch をモックして実ネットワーク呼び出しなしで以下を検証する:
 * - createBot 成功: botId 返却 + リクエストボディの構造
 * - createBot 無効 URL: invalid_meeting_url（fetch 未呼び出し）
 * - createBot 429: rate_limited
 * - createBot 4xx: api_error（status 付き）
 * - createBot ネットワーク障害: network
 * - leaveBot 成功とエラーマッピング
 * - getRecordingDownloadUrl 成功と { url, expiresAt } 構造、エラーマッピング
 *
 * Requirements: 1.1, 1.2, 1.3, 2.4
 */

// `server-only` はNext.jsビルド時専用の副作用パッケージで、vitest Node環境では提供されない。
// ランタイム意味は「クライアントバンドルへの誤混入を防ぐ」のみなので空モジュールで安全に置換できる。
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRecallClient } from './recall-client';

// ---------------------------------------------------------------------------
// テスト用 env を固定
// ---------------------------------------------------------------------------

const BASE_URL = 'https://us-east-1.recall.ai';
const API_KEY = 'test-api-key';

beforeEach(() => {
  vi.stubEnv('RECALL_API_BASE_URL', BASE_URL);
  vi.stubEnv('RECALL_API_KEY', API_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ヘルパー: fetch モック
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

function mockFetchThrows(error: Error): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
}

// ---------------------------------------------------------------------------
// createBot
// ---------------------------------------------------------------------------

describe('createBot', () => {
  it('成功時に { ok:true, value:{ botId } } を返す', async () => {
    mockFetch(201, { id: 'bot-abc123' });
    const client = createRecallClient();

    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/j/1234567890',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/api/webhooks/recall/transcript?token=tok',
      metadata: { sessionId: 'session-xyz' },
    });

    expect(result).toEqual({ ok: true, value: { botId: 'bot-abc123' } });
  });

  it('createBot のリクエストボディに transcript provider / realtime endpoint / bot name / sessionId が含まれる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'bot-def456' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createRecallClient();
    await client.createBot({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook?token=secret',
      metadata: { sessionId: 'session-check' },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // エンドポイント確認
    expect(url).toContain(BASE_URL);
    expect(url).toContain('/api/v1/bot');

    // ヘッダー確認
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toContain(API_KEY);

    // ボディ確認
    const body = JSON.parse(init.body as string);
    expect(body.bot_name).toBe('bulr 記録ボット');
    expect(body.recording_config.transcript.provider).toBe('deepgram_streaming');
    expect(body.realtime_endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://example.com/webhook?token=secret',
          events: expect.arrayContaining(['transcript.data']),
        }),
      ]),
    );
    expect(body.metadata.session_id).toBe('session-check');
  });

  it('無効な会議 URL の場合に invalid_meeting_url を返し fetch を呼ばない', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const client = createRecallClient();
    const result = await client.createBot({
      meetingUrl: 'https://example.com/not-a-meeting',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'session-xyz' },
    });

    expect(result).toEqual({ ok: false, error: { code: 'invalid_meeting_url' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('429 レスポンスで rate_limited を返す', async () => {
    mockFetch(429, { detail: 'Too Many Requests' });
    const client = createRecallClient();

    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/j/9876543210',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'session-xyz' },
    });

    expect(result).toEqual({ ok: false, error: { code: 'rate_limited' } });
  });

  it('5xx レスポンスで api_error を返す（status 付き）', async () => {
    mockFetch(500, { detail: 'Internal Server Error' });
    const client = createRecallClient();

    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/j/9876543210',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'session-xyz' },
    });

    expect(result).toEqual({ ok: false, error: { code: 'api_error', status: 500 } });
  });

  it('4xx（non-429, non-meeting-url-error）レスポンスで api_error を返す', async () => {
    mockFetch(400, { detail: 'Bad Request' });
    const client = createRecallClient();

    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/j/9876543210',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'session-xyz' },
    });

    expect(result).toEqual({ ok: false, error: { code: 'api_error', status: 400 } });
  });

  it('fetch が例外をスローした場合に network エラーを返す', async () => {
    mockFetchThrows(new TypeError('Failed to fetch'));
    const client = createRecallClient();

    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/j/1234567890',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'session-xyz' },
    });

    expect(result).toEqual({ ok: false, error: { code: 'network' } });
  });

  // ---
  // 会議 URL バリデーション: Zoom
  // ---

  it('Zoom /j/ URL を受け付ける', async () => {
    mockFetch(201, { id: 'bot-zoom-j' });
    const client = createRecallClient();
    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/j/123456789?pwd=xxxxx',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'sess' },
    });
    expect(result.ok).toBe(true);
  });

  it('Zoom /my/ URL を受け付ける', async () => {
    mockFetch(201, { id: 'bot-zoom-my' });
    const client = createRecallClient();
    const result = await client.createBot({
      meetingUrl: 'https://zoom.us/my/my-meeting-room',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'sess' },
    });
    expect(result.ok).toBe(true);
  });

  it('Google Meet URL を受け付ける', async () => {
    mockFetch(201, { id: 'bot-meet' });
    const client = createRecallClient();
    const result = await client.createBot({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'sess' },
    });
    expect(result.ok).toBe(true);
  });

  it('Microsoft Teams URL を受け付ける', async () => {
    mockFetch(201, { id: 'bot-teams' });
    const client = createRecallClient();
    const result = await client.createBot({
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/abc/123',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'sess' },
    });
    expect(result.ok).toBe(true);
  });

  it('Teams Live URL を受け付ける', async () => {
    mockFetch(201, { id: 'bot-teams-live' });
    const client = createRecallClient();
    const result = await client.createBot({
      meetingUrl: 'https://teams.live.com/meet/12345678',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'sess' },
    });
    expect(result.ok).toBe(true);
  });

  it('非対応プラットフォームの URL を拒否する', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = createRecallClient();

    const result = await client.createBot({
      meetingUrl: 'https://webex.com/join/meeting',
      botName: 'bulr 記録ボット',
      transcriptProvider: 'deepgram_streaming',
      webhookBaseUrl: 'https://example.com/webhook',
      metadata: { sessionId: 'sess' },
    });

    expect(result).toEqual({ ok: false, error: { code: 'invalid_meeting_url' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// leaveBot
// ---------------------------------------------------------------------------

describe('leaveBot', () => {
  it('成功時に { ok:true, value:undefined } を返す', async () => {
    mockFetch(200, {});
    const client = createRecallClient();

    const result = await client.leaveBot('bot-abc123');

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('429 レスポンスで rate_limited を返す', async () => {
    mockFetch(429, {});
    const client = createRecallClient();

    const result = await client.leaveBot('bot-abc123');

    expect(result).toEqual({ ok: false, error: { code: 'rate_limited' } });
  });

  it('5xx レスポンスで api_error を返す', async () => {
    mockFetch(503, {});
    const client = createRecallClient();

    const result = await client.leaveBot('bot-abc123');

    expect(result).toEqual({ ok: false, error: { code: 'api_error', status: 503 } });
  });

  it('fetch が例外をスローした場合に network エラーを返す', async () => {
    mockFetchThrows(new TypeError('Network failure'));
    const client = createRecallClient();

    const result = await client.leaveBot('bot-abc123');

    expect(result).toEqual({ ok: false, error: { code: 'network' } });
  });
});

// ---------------------------------------------------------------------------
// getRecordingDownloadUrl
// ---------------------------------------------------------------------------

describe('getRecordingDownloadUrl', () => {
  it('成功時に { ok:true, value:{ url, expiresAt } } を返す', async () => {
    mockFetch(200, {
      download_url: 'https://storage.recall.ai/recording.mp4',
      expires_at: '2026-07-01T12:00:00Z',
    });
    const client = createRecallClient();

    const result = await client.getRecordingDownloadUrl('bot-abc123');

    expect(result).toEqual({
      ok: true,
      value: {
        url: 'https://storage.recall.ai/recording.mp4',
        expiresAt: '2026-07-01T12:00:00Z',
      },
    });
  });

  it('4xx レスポンスで api_error を返す', async () => {
    mockFetch(404, { detail: 'Not found' });
    const client = createRecallClient();

    const result = await client.getRecordingDownloadUrl('bot-missing');

    expect(result).toEqual({ ok: false, error: { code: 'api_error', status: 404 } });
  });

  it('fetch が例外をスローした場合に network エラーを返す', async () => {
    mockFetchThrows(new Error('Connection refused'));
    const client = createRecallClient();

    const result = await client.getRecordingDownloadUrl('bot-abc123');

    expect(result).toEqual({ ok: false, error: { code: 'network' } });
  });
});

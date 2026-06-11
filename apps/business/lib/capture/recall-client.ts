/**
 * Recall API アダプタ（RecallClient）。
 *
 * Recall.ai のベンダー知識をこのファイルに閉じ込める。
 * apps/business 専用。他アプリからは使用しない（design.md 依存方向）。
 *
 * 提供機能:
 * - createBot  — 会議への録音ボット参加（transcript 設定・realtime_endpoints 込み）
 * - leaveBot   — ボットを会議から退出させる
 * - getRecordingDownloadUrl — 録音ファイルの署名付きダウンロード URL を取得
 *
 * すべての操作は Result<T, RecallError> 型のエンベロープで返る。
 * API キーはサーバー専用 env（RECALL_API_KEY）から取得し、クライアントへの露出を禁止する。
 *
 * Requirements: 1.1, 1.2, 1.3, 2.4
 */

import 'server-only';

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Result 型
//
// packages/auth の Result<R> は単一型パラメータで error 形状が固定のため
// RecallError ユニオンに適さない。ここでは 2 型パラメータ版をローカル定義する。
// ---------------------------------------------------------------------------

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ---------------------------------------------------------------------------
// RecallError ユニオン
// ---------------------------------------------------------------------------

export type RecallError =
  | { code: 'invalid_meeting_url' }
  | { code: 'rate_limited' }
  | { code: 'api_error'; status: number }
  | { code: 'network' };

// ---------------------------------------------------------------------------
// 会議 URL バリデーション（Req 1.2, 2.4, 7.2）
//
// 受け付けるプラットフォーム:
//   Zoom:    zoom.us/j/{id}  または  zoom.us/my/{room}
//   Meet:    meet.google.com/{code}  (xxx-xxxx-xxx パターン)
//   Teams:   teams.microsoft.com/l/meetup-join/...
//            teams.live.com/meet/...
// ---------------------------------------------------------------------------

const ZOOM_REGEX = /^https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/(j|my)\/[a-zA-Z0-9?=&._-]+/;
const MEET_REGEX = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/.*)?$/;
const TEAMS_REGEX =
  /^https:\/\/(teams\.microsoft\.com\/l\/meetup-join\/|teams\.live\.com\/meet\/)[a-zA-Z0-9%@._~:/?#[\]!$&'()*+,;=-]+/;

export const meetingUrlSchema = z
  .string()
  .refine(
    (url) => ZOOM_REGEX.test(url) || MEET_REGEX.test(url) || TEAMS_REGEX.test(url),
    { message: 'invalid_meeting_url' },
  );

function isValidMeetingUrl(url: string): boolean {
  return meetingUrlSchema.safeParse(url).success;
}

// ---------------------------------------------------------------------------
// RecallClient インターフェース
// ---------------------------------------------------------------------------

export interface RecallClient {
  createBot(input: {
    meetingUrl: string;
    botName: string;
    transcriptProvider: string;
    webhookBaseUrl: string;
    metadata: { sessionId: string };
  }): Promise<Result<{ botId: string }, RecallError>>;

  leaveBot(botId: string): Promise<Result<void, RecallError>>;

  getRecordingDownloadUrl(
    botId: string,
  ): Promise<Result<{ url: string; expiresAt: string }, RecallError>>;
}

// ---------------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------------

/**
 * Recall API へのリクエストに共通の Authorization ヘッダーと
 * Content-Type を付与して fetch を呼び出す。
 *
 * ネットワーク例外は呼び出し元で catch する（エンベロープへの変換は各操作で行う）。
 */
async function recallFetch(
  url: string,
  options: {
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
  },
): Promise<Response> {
  const apiKey = process.env.RECALL_API_KEY;
  const headers: Record<string, string> = {
    Authorization: `Token ${apiKey}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** HTTP ステータスから RecallError を導出する。 */
function httpStatusToError(status: number): RecallError {
  if (status === 429) return { code: 'rate_limited' };
  return { code: 'api_error', status };
}

// ---------------------------------------------------------------------------
// RecallClient 実装
// ---------------------------------------------------------------------------

/**
 * RecallClient のファクトリ関数。
 *
 * 依存する env:
 *   - RECALL_API_BASE_URL  — リージョン別ベース URL (例: https://us-east-1.recall.ai)
 *   - RECALL_API_KEY       — Recall API キー（サーバー専用・ログ出力禁止）
 */
export function createRecallClient(): RecallClient {
  const baseUrl = process.env.RECALL_API_BASE_URL ?? '';

  return {
    // -------------------------------------------------------------------------
    // createBot
    // -------------------------------------------------------------------------
    async createBot(input): Promise<Result<{ botId: string }, RecallError>> {
      // 1. 会議 URL のローカル Zod バリデーション（Req 1.2, 2.4）
      //    失敗時は fetch を呼ばずに即座に invalid_meeting_url を返す。
      if (!isValidMeetingUrl(input.meetingUrl)) {
        return { ok: false, error: { code: 'invalid_meeting_url' } };
      }

      // 2. Recall API へボット作成リクエスト
      let response: Response;
      try {
        response = await recallFetch(`${baseUrl}/api/v1/bot/`, {
          method: 'POST',
          body: {
            meeting_url: input.meetingUrl,
            bot_name: input.botName, // Req 1.3: 記録中であることが分かる表示名
            recording_config: {
              transcript: {
                provider: input.transcriptProvider, // Req 2.4: CAPTURE_TRANSCRIPT_PROVIDER
              },
            },
            // final-only 方針（design.md WebhookIngestion Event Contract）
            realtime_endpoints: [
              {
                url: input.webhookBaseUrl,
                events: ['transcript.data'],
              },
            ],
            metadata: {
              session_id: input.metadata.sessionId,
            },
          },
        });
      } catch {
        return { ok: false, error: { code: 'network' } };
      }

      if (!response.ok) {
        return { ok: false, error: httpStatusToError(response.status) };
      }

      const data = (await response.json()) as { id: string };
      return { ok: true, value: { botId: data.id } };
    },

    // -------------------------------------------------------------------------
    // leaveBot
    // -------------------------------------------------------------------------
    async leaveBot(botId): Promise<Result<void, RecallError>> {
      let response: Response;
      try {
        response = await recallFetch(`${baseUrl}/api/v1/bot/${botId}/leave_call/`, {
          method: 'POST',
        });
      } catch {
        return { ok: false, error: { code: 'network' } };
      }

      if (!response.ok) {
        return { ok: false, error: httpStatusToError(response.status) };
      }

      return { ok: true, value: undefined };
    },

    // -------------------------------------------------------------------------
    // getRecordingDownloadUrl
    // -------------------------------------------------------------------------
    async getRecordingDownloadUrl(
      botId,
    ): Promise<Result<{ url: string; expiresAt: string }, RecallError>> {
      let response: Response;
      try {
        response = await recallFetch(`${baseUrl}/api/v1/bot/${botId}/outputs/`, {
          method: 'GET',
        });
      } catch {
        return { ok: false, error: { code: 'network' } };
      }

      if (!response.ok) {
        return { ok: false, error: httpStatusToError(response.status) };
      }

      const data = (await response.json()) as {
        download_url: string;
        expires_at: string;
      };
      return { ok: true, value: { url: data.download_url, expiresAt: data.expires_at } };
    },
  };
}

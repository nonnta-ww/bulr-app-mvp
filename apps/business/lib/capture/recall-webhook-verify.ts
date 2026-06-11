/**
 * Recall webhook 検証ヘルパー。
 *
 * 2 種類の認証を提供する:
 *   1. status webhook の Svix 署名検証（verifyStatusSignature）
 *   2. transcript webhook のセッション毎 URL 埋め込みトークン発行・検証
 *      （issueTranscriptToken / verifyTranscriptToken / buildTranscriptWebhookUrl）
 *
 * 両方とも RECALL_WEBHOOK_SECRET（env）を消費する。
 * このモジュールはサーバー専用（server-only）。クライアントへの露出を禁止する。
 * シークレットのログ出力も禁止する。
 *
 * Requirements: 7.2
 * Design: WebhookIngestion API Contract, Security Considerations, Unit Tests #3
 */

import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Svix status webhook 署名検証
// ---------------------------------------------------------------------------

/**
 * Recall の status webhook は Svix で署名される。
 *
 * ヘッダー:
 *   svix-id        — メッセージ識別子
 *   svix-timestamp — UNIX タイムスタンプ（秒）
 *   svix-signature — スペース区切りの "v1,<base64sig>" エントリ列
 *
 * 署名対象: `${svix-id}.${svix-timestamp}.${rawBody}`
 * 署名計算: HMAC-SHA256(hmacKey, signedContent)
 * HMAC キー: RECALL_WEBHOOK_SECRET の "whsec_" プレフィックス後を base64 デコードしたバイト列
 *
 * 複数エントリが存在する場合、いずれか 1 つが一致すれば通過（ローテーション対応）。
 *
 * @param opts.headers  - リクエストヘッダー（Partial）
 * @param opts.rawBody  - 検証済みでない生ボディ文字列（JSON.stringify 前の文字列）
 * @returns 署名が有効なら true、そうでなければ false（401 相当）
 */
export function verifyStatusSignature(opts: {
  headers: Partial<Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>>;
  rawBody: string;
}): boolean {
  const { headers, rawBody } = opts;

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  // 必須ヘッダーの欠落チェック
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // RECALL_WEBHOOK_SECRET から HMAC キーを導出
  const hmacKey = deriveSvixHmacKey();
  if (hmacKey === null) {
    return false;
  }

  // 署名対象文字列
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  // 期待される HMAC バイト列を計算（base64 ではなく raw bytes）
  const expectedBytes = createHmac('sha256', hmacKey).update(signedContent).digest();

  // "v1,<base64sig1> v1,<base64sig2>" の各エントリを検査
  const entries = svixSignature.split(' ');
  for (const entry of entries) {
    if (!entry.startsWith('v1,')) continue;

    const sigBase64 = entry.slice(3);
    let sigBytes: Buffer;
    try {
      sigBytes = Buffer.from(sigBase64, 'base64');
    } catch {
      continue;
    }

    // timingSafeEqual はバッファ長が異なると例外を投げるため、長さを先に確認する
    if (sigBytes.length !== expectedBytes.length) continue;

    if (timingSafeEqual(sigBytes, expectedBytes)) {
      return true;
    }
  }

  return false;
}

/**
 * RECALL_WEBHOOK_SECRET から Svix HMAC キーを導出する。
 *
 * Svix のシークレット形式: "whsec_<base64encodedBytes>"
 * この "whsec_" プレフィックスを除去し、残りを base64 デコードして HMAC キーとする。
 * プレフィックスがない場合は UTF-8 バッファとして使用する（非 Svix 形式のフォールバック）。
 *
 * @returns Buffer（HMAC キー）または null（env 未設定 / デコード失敗）
 */
function deriveSvixHmacKey(): Buffer | null {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) return null;

  if (secret.startsWith('whsec_')) {
    try {
      const keyBytes = Buffer.from(secret.slice(6), 'base64');
      if (keyBytes.length === 0) return null;
      return keyBytes;
    } catch {
      return null;
    }
  }

  // "whsec_" プレフィックスがない場合は UTF-8 バッファとして使用
  return Buffer.from(secret, 'utf8');
}

// ---------------------------------------------------------------------------
// transcript webhook URL 埋め込みトークン
// ---------------------------------------------------------------------------

/**
 * セッション毎のトランスクリプト webhook URL トークンを発行する。
 *
 * トークン形式: `${sessionId}.${hmacHex}` （DB ルックアップ不要で検証可能）
 * HMAC:        HMAC-SHA256(RECALL_WEBHOOK_SECRET, sessionId) の hex 文字列
 *
 * このトークンは createBot の webhookBaseUrl に `?token=<token>` として埋め込む。
 * （task 2.1 の createBot が消費する「発行契約」）
 *
 * UUID 形式の sessionId は "." を含まないため、最初の "." をセパレータとして使用できる。
 *
 * @param opts.sessionId - 面接セッション ID（UUID 想定）
 * @returns 検証可能な opaque トークン文字列
 */
export function issueTranscriptToken(opts: { sessionId: string }): string {
  const { sessionId } = opts;
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  // シークレット未設定では検証可能なトークンを発行しない（空キー HMAC による
  // トークン偽造を防ぐ）。verifyStatusSignature の missing-secret 拒否と一貫させる。
  if (!secret) {
    throw new Error('RECALL_WEBHOOK_SECRET is not configured');
  }
  const hmac = createHmac('sha256', secret).update(sessionId).digest('hex');
  return `${sessionId}.${hmac}`;
}

/**
 * トランスクリプト webhook の URL トークンを検証する。
 *
 * - DB ルックアップなし（sessionId ↔ bot_id の突合は呼び出し元 route が実施）
 * - 定数時間比較（timingSafeEqual）でタイミング攻撃を防ぐ
 *
 * @param token - URL の `?token=` パラメータ値
 * @returns 検証成功時は `{ ok: true, sessionId }`、失敗時は `{ ok: false }`
 */
export function verifyTranscriptToken(
  token: string,
): { ok: true; sessionId: string } | { ok: false } {
  if (!token) return { ok: false };

  // "sessionId.hmacHex" 形式を最初の "." で分割
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return { ok: false };

  const sessionId = token.slice(0, dotIndex);
  const providedHmac = token.slice(dotIndex + 1);

  if (!sessionId || !providedHmac) return { ok: false };

  // シークレット未設定では検証不能 → 拒否（空キー HMAC でのトークン偽造を防ぐ）。
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) return { ok: false };

  // 期待される HMAC を再計算
  const expectedHmac = createHmac('sha256', secret).update(sessionId).digest('hex');

  // バッファ化して定数時間比較
  const expectedBuf = Buffer.from(expectedHmac, 'utf8');
  const providedBuf = Buffer.from(providedHmac, 'utf8');

  // 長さが異なればタイミング攻撃のリスクなく即拒否
  if (expectedBuf.length !== providedBuf.length) return { ok: false };

  if (timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: true, sessionId };
  }

  return { ok: false };
}

/**
 * transcript webhook URL を構築する。
 *
 * @param baseUrl - transcript webhook ベース URL
 *                  例: "https://example.com/api/webhooks/recall/transcript"
 * @param token   - issueTranscriptToken が返したトークン
 * @returns token クエリパラメータ付きの完全 URL
 */
export function buildTranscriptWebhookUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

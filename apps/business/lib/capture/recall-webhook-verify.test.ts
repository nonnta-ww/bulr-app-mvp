/**
 * recall-webhook-verify.ts の単体テスト。
 *
 * ネットワーク・DB なしで以下を検証する:
 *   - verifyStatusSignature: 正規 Svix 署名が通過 / 誤署名・改ざんボディ・欠落ヘッダーが拒否
 *   - issueTranscriptToken / verifyTranscriptToken: ラウンドトリップ / 改ざん・空・別シークレットが拒否
 *   - buildTranscriptWebhookUrl: token クエリパラメータ付き URL の生成
 *
 * Requirements: 7.2
 * Design: WebhookIngestion API Contract, Security Considerations, Unit Tests #3
 */

// `server-only` は Next.js ビルド専用の副作用パッケージ。
// ランタイム意味は「クライアントバンドルへの誤混入を防ぐ」のみなので空モックで安全に置換できる。
vi.mock('server-only', () => ({}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import {
  verifyStatusSignature,
  issueTranscriptToken,
  verifyTranscriptToken,
  buildTranscriptWebhookUrl,
} from './recall-webhook-verify';

// ---------------------------------------------------------------------------
// テスト用ヘルパー: Svix 署名の構築
// ---------------------------------------------------------------------------

/** テスト用のランダム HMAC キーと対応する env 形式シークレットを生成する。 */
function buildSvixSecret(): { rawKey: Buffer; envSecret: string } {
  const rawKey = randomBytes(32);
  const envSecret = `whsec_${rawKey.toString('base64')}`;
  return { rawKey, envSecret };
}

/**
 * Svix の署名アルゴリズムを再現して base64 署名を返す。
 * 実装側と同一の HMAC-SHA256(rawKey, "${svixId}.${svixTimestamp}.${rawBody}")。
 */
function signSvix(
  rawKey: Buffer,
  opts: { svixId: string; svixTimestamp: string; rawBody: string },
): string {
  const signedContent = `${opts.svixId}.${opts.svixTimestamp}.${opts.rawBody}`;
  return createHmac('sha256', rawKey).update(signedContent).digest('base64');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
// verifyStatusSignature — Svix 署名検証（Req 7.2、design: WebhookIngestion API Contract）
// ===========================================================================

describe('verifyStatusSignature', () => {
  it('正規署名が通過する', () => {
    const { rawKey, envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const svixId = 'msg_01H1234567890ABCDEFG';
    const svixTimestamp = '1717200000';
    const rawBody = '{"event":"bot.in_call_recording"}';
    const sig = signSvix(rawKey, { svixId, svixTimestamp, rawBody });

    const result = verifyStatusSignature({
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${sig}`,
      },
      rawBody,
    });

    expect(result).toBe(true);
  });

  it('複数署名エントリのうち 1 つが正しければ通過する（ローテーション対応）', () => {
    const { rawKey, envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const svixId = 'msg_multi';
    const svixTimestamp = '1717200000';
    const rawBody = '{"event":"bot.done"}';
    const sig = signSvix(rawKey, { svixId, svixTimestamp, rawBody });

    // 不正な署名エントリと正規署名エントリを両方含む
    const result = verifyStatusSignature({
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= v1,${sig}`,
      },
      rawBody,
    });

    expect(result).toBe(true);
  });

  it('誤った署名（異なる HMAC キーで生成）が拒否される', () => {
    const { envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const svixId = 'msg_bad';
    const svixTimestamp = '1717200000';
    const rawBody = '{"event":"bot.fatal"}';

    // 別のランダムキーで署名（= 誤った署名）
    const { rawKey: otherKey } = buildSvixSecret();
    const wrongSig = signSvix(otherKey, { svixId, svixTimestamp, rawBody });

    const result = verifyStatusSignature({
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${wrongSig}`,
      },
      rawBody,
    });

    expect(result).toBe(false);
  });

  it('ボディが改ざんされると拒否される', () => {
    const { rawKey, envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const svixId = 'msg_tampered';
    const svixTimestamp = '1717200000';
    const originalBody = '{"event":"bot.in_call_recording"}';
    // 正規ボディで署名して、改ざんされたボディで検証する
    const sig = signSvix(rawKey, { svixId, svixTimestamp, rawBody: originalBody });

    const result = verifyStatusSignature({
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${sig}`,
      },
      rawBody: '{"event":"bot.in_call_recording","injected":true}',
    });

    expect(result).toBe(false);
  });

  it('svix-id ヘッダーが欠落すると拒否される（401 相当）', () => {
    const { envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const result = verifyStatusSignature({
      headers: {
        'svix-timestamp': '1717200000',
        'svix-signature': 'v1,somesig',
      },
      rawBody: '{}',
    });

    expect(result).toBe(false);
  });

  it('svix-timestamp ヘッダーが欠落すると拒否される（401 相当）', () => {
    const { envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const result = verifyStatusSignature({
      headers: {
        'svix-id': 'msg_no_ts',
        'svix-signature': 'v1,somesig',
      },
      rawBody: '{}',
    });

    expect(result).toBe(false);
  });

  it('svix-signature ヘッダーが欠落すると拒否される（401 相当）', () => {
    const { envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const result = verifyStatusSignature({
      headers: {
        'svix-id': 'msg_no_sig',
        'svix-timestamp': '1717200000',
      },
      rawBody: '{}',
    });

    expect(result).toBe(false);
  });

  it('RECALL_WEBHOOK_SECRET が未設定のとき拒否される', () => {
    // env をスタブしない = 未設定

    const result = verifyStatusSignature({
      headers: {
        'svix-id': 'msg_no_secret',
        'svix-timestamp': '1717200000',
        'svix-signature': 'v1,anything',
      },
      rawBody: '{}',
    });

    expect(result).toBe(false);
  });

  it('"v1," プレフィックスなしのエントリは無視され、他に有効なものがなければ拒否される', () => {
    const { envSecret } = buildSvixSecret();
    vi.stubEnv('RECALL_WEBHOOK_SECRET', envSecret);

    const result = verifyStatusSignature({
      headers: {
        'svix-id': 'msg_bad_format',
        'svix-timestamp': '1717200000',
        // "v0," や prefix なしは v1 スキームではない
        'svix-signature': 'v0,invalidsig noprefix_invalidsig',
      },
      rawBody: '{"event":"test"}',
    });

    expect(result).toBe(false);
  });
});

// ===========================================================================
// issueTranscriptToken / verifyTranscriptToken — トークン発行と検証
// （Req 7.2、design: Security Considerations）
// ===========================================================================

describe('issueTranscriptToken / verifyTranscriptToken round-trip', () => {
  const SESSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  // 任意の固定シークレット（テスト決定論性のため固定）
  const SECRET = 'whsec_dGVzdHNlY3JldGZvcnRyYW5zY3JpcHR0b2tlbg==';

  beforeEach(() => {
    vi.stubEnv('RECALL_WEBHOOK_SECRET', SECRET);
  });

  it('発行したトークンが検証を通過して sessionId を返す', () => {
    const token = issueTranscriptToken({ sessionId: SESSION_ID });
    const result = verifyTranscriptToken(token);

    expect(result).toEqual({ ok: true, sessionId: SESSION_ID });
  });

  it('末尾が改ざんされたトークンが拒否される', () => {
    const token = issueTranscriptToken({ sessionId: SESSION_ID });
    // 末尾 4 文字を置換して改ざん
    const tampered = token.slice(0, -4) + 'xxxx';

    const result = verifyTranscriptToken(tampered);
    expect(result).toEqual({ ok: false });
  });

  it('空文字列トークンが拒否される', () => {
    expect(verifyTranscriptToken('')).toEqual({ ok: false });
  });

  it('別のシークレットで発行したトークンが拒否される', () => {
    // 現在のシークレットでトークンを発行
    const token = issueTranscriptToken({ sessionId: SESSION_ID });

    // 別のシークレットに切り替えて検証
    vi.stubEnv('RECALL_WEBHOOK_SECRET', 'whsec_ZGlmZmVyZW50c2VjcmV0Zm9ydGVzdGluZw==');
    const result = verifyTranscriptToken(token);

    expect(result).toEqual({ ok: false });
  });

  it('区切り文字（.）を含まないトークンが拒否される', () => {
    const result = verifyTranscriptToken('notavalidtokenformat');
    expect(result).toEqual({ ok: false });
  });

  it('sessionId 部分だけのトークン（"sessionId."）が拒否される', () => {
    const result = verifyTranscriptToken(`${SESSION_ID}.`);
    expect(result).toEqual({ ok: false });
  });

  it('異なる sessionId でも独立してトークンを発行・検証できる', () => {
    const id1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const id2 = 'ffffffff-0000-1111-2222-333333333333';

    const token1 = issueTranscriptToken({ sessionId: id1 });
    const token2 = issueTranscriptToken({ sessionId: id2 });

    expect(verifyTranscriptToken(token1)).toEqual({ ok: true, sessionId: id1 });
    expect(verifyTranscriptToken(token2)).toEqual({ ok: true, sessionId: id2 });
    // 異なるセッションのトークンは異なる
    expect(token1).not.toBe(token2);
  });

  it('発行されたトークンは sessionId.hexHmac の形式である', () => {
    const token = issueTranscriptToken({ sessionId: SESSION_ID });
    const parts = token.split('.');
    // UUID は "-" のみ。最初の "." がセパレータ
    expect(parts[0]).toBe(SESSION_ID);
    // HMAC-SHA256 の hex は 64 文字
    expect(parts[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RECALL_WEBHOOK_SECRET が未設定なら発行は失敗する（空キー HMAC でのトークン偽造を防ぐ）', () => {
    const token = issueTranscriptToken({ sessionId: SESSION_ID });
    vi.stubEnv('RECALL_WEBHOOK_SECRET', '');
    // 発行はエラー（検証可能なトークンを作れない）
    expect(() => issueTranscriptToken({ sessionId: SESSION_ID })).toThrow();
    // 既存トークンも secret 未設定下では検証拒否される
    expect(verifyTranscriptToken(token)).toEqual({ ok: false });
  });
});

// ===========================================================================
// buildTranscriptWebhookUrl — URL ヘルパー
// ===========================================================================

describe('buildTranscriptWebhookUrl', () => {
  it('トークンを ?token= クエリパラメータとして URL に埋め込む', () => {
    vi.stubEnv('RECALL_WEBHOOK_SECRET', 'whsec_dGVzdA==');
    const token = issueTranscriptToken({ sessionId: 'sess-1' });
    const url = buildTranscriptWebhookUrl(
      'https://example.com/api/webhooks/recall/transcript',
      token,
    );

    expect(url).toMatch(/^https:\/\/example\.com\/api\/webhooks\/recall\/transcript\?token=/);
    expect(url).toContain(encodeURIComponent(token).replace(/%2F/g, '/'));
  });

  it('既存のクエリパラメータがある場合でも token を追加できる', () => {
    vi.stubEnv('RECALL_WEBHOOK_SECRET', 'whsec_dGVzdA==');
    const token = issueTranscriptToken({ sessionId: 'sess-2' });
    const url = buildTranscriptWebhookUrl(
      'https://example.com/api/webhooks/recall/transcript?env=prod',
      token,
    );

    expect(url).toContain('env=prod');
    expect(url).toContain('token=');
  });
});

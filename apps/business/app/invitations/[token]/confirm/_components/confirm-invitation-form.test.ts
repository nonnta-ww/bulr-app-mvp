/**
 * ConfirmInvitationForm — messageForCode 単体テスト
 *
 * messageForCode はドメインエラーコードを日本語メッセージに変換する純粋関数。
 * 実装前に RED で書いておく（TDD）。
 *
 * Requirements: company-user-invitation 2.3, 2.6
 */

// server-only は Next.js ビルド専用。vitest Node 環境では空モックに置換する。
vi.mock('server-only', () => ({}));

// acceptCompanyInvitation は Server Action（DB/cookie 依存）のためモックする
vi.mock('../_actions/accept-company-invitation', () => ({
  acceptCompanyInvitation: vi.fn(),
}));

import { describe, it, expect, vi } from 'vitest';
import { messageForCode } from './confirm-invitation-form';

describe('messageForCode', () => {
  const knownCodes = [
    'INVALID_TOKEN',
    'REVOKED',
    'ALREADY_CONSUMED',
    'EXPIRED',
    'COMPANY_INACTIVE',
    'EMAIL_MISMATCH',
    'ALREADY_MEMBER',
  ] as const;

  it.each(knownCodes)('code=%s maps to a non-empty Japanese message', (code) => {
    const msg = messageForCode(code);
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('unknown code returns fallback message', () => {
    const msg = messageForCode('SOME_UNKNOWN_CODE');
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('unknown code with explicit fallback returns that fallback', () => {
    const fallback = 'カスタムエラーメッセージ';
    const msg = messageForCode('NONEXISTENT', fallback);
    expect(msg).toBe(fallback);
  });

  it('each known code produces a distinct message', () => {
    const messages = knownCodes.map((c) => messageForCode(c));
    const unique = new Set(messages);
    expect(unique.size).toBe(knownCodes.length);
  });
});

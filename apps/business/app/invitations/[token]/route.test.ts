/**
 * GET /invitations/[token] route handler のユニットテスト
 *
 * 検証観点 (Req 2.4, 6.3):
 * 1. 不正トークン（記号含む / 長すぎる）→ notFound() を呼ぶ（6.3）
 * 2. 未認証（getCurrentUser → null）→ /sign-in?token=<token> へリダイレクト（2.4）
 * 3. 認証済み → pending_invitation_token cookie を設定し /invitations/<token>/confirm へリダイレクト（2.4）
 *
 * Requirements: 2.4, 6.3
 */

// server-only は Next.js ビルド専用。vitest Node 環境では空モックに置換する。
vi.mock('server-only', () => ({}));

// next/navigation の notFound をモック
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

// ---------------------------------------------------------------------------
// vi.hoisted: getCurrentUser モック（vi.mock ファクトリ内から参照できるよう先に評価）
// ---------------------------------------------------------------------------
const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}));

vi.mock('@bulr/auth/server', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { notFound } from 'next/navigation';

// route.ts はまだ存在しないため、RED フェーズでは import が失敗する
import { GET } from './route';

// ---------------------------------------------------------------------------
// ヘルパー: NextRequest を組み立てる
// ---------------------------------------------------------------------------
function makeRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/invitations/${token}`);
}

function makeRouteContext(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('GET /invitations/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // (1) 不正トークン形式 → notFound
  // =========================================================================

  describe('(1) 不正トークン形式 → notFound (Req 6.3)', () => {
    it('スラッシュを含むトークン → notFound を呼ぶ', async () => {
      const token = 'abc/def';
      await expect(GET(makeRequest(token), makeRouteContext(token))).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(notFound).toHaveBeenCalled();
    });

    it('@を含むトークン → notFound を呼ぶ', async () => {
      const token = 'abc@def';
      await expect(GET(makeRequest(token), makeRouteContext(token))).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(notFound).toHaveBeenCalled();
    });

    it('256文字超のトークン → notFound を呼ぶ', async () => {
      const token = 'a'.repeat(257);
      await expect(GET(makeRequest(token), makeRouteContext(token))).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(notFound).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // (2) 未認証 → /sign-in?token=... へリダイレクト
  // =========================================================================

  describe('(2) 未認証 → sign-in リダイレクト (Req 2.4)', () => {
    it('getCurrentUser が null → /sign-in?token=<token> にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const token = 'valid-token-abc123';
      const res = await GET(makeRequest(token), makeRouteContext(token));

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/sign-in');
      expect(location).toContain(encodeURIComponent(token));
    });
  });

  // =========================================================================
  // (3) 認証済み → cookie 設定 + /invitations/<token>/confirm へリダイレクト
  // =========================================================================

  describe('(3) 認証済み → cookie 設定 + confirm リダイレクト (Req 2.4)', () => {
    it('cookie pending_invitation_token が設定され /invitations/<token>/confirm にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: 'user-001', email: 'test@example.com' });
      const token = 'valid-token-xyz789';
      const res = await GET(makeRequest(token), makeRouteContext(token));

      // リダイレクトのステータス
      expect(res.status).toBe(307);

      // Location ヘッダーが /invitations/<token>/confirm を指す
      const location = res.headers.get('location');
      expect(location).toContain(`/invitations/${token}/confirm`);

      // Set-Cookie ヘッダーに pending_invitation_token が含まれる
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('pending_invitation_token');
      expect(setCookie).toContain(token);
      expect(setCookie).toContain('HttpOnly');
    });
  });
});

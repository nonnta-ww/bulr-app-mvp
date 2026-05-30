/**
 * @file middleware.ts (proxy)
 *
 * このファイルは UX リダイレクトのみを担当する。
 *
 * ⚠️ CVE-2025-29927 (2025 年に発覚した Next.js middleware bypass 攻撃) の教訓により、
 *    認可は本ファイルに依存してはならない。
 *    各 Server Component / Server Action / API Route で requireUser() / requireCandidate() を独立に呼び出すこと。
 *
 * やること:
 *   - /onboarding への Cookie 存在チェック → /sign-in リダイレクト
 *   - /invitations/{token} への Cookie 存在チェック → /sign-in?token={token} リダイレクト
 *
 * やらないこと:
 *   - Better Auth セッション validation（Cookie の存在確認のみ、セッションの有効性は Server Component で requireUser() が行う）
 *   - candidate_profile の存在確認（DB クエリが必要なため、ページ側の requireCandidate() に委譲する）
 *   - 招待トークンの意味検証（Wave 3 company-and-opening / entry-flow の責務）
 *   - Server Action / API Route の認可
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware。
 * UX リダイレクトのみを担う。認可判定（セッション有効性 / プロファイル存在確認）は行わない。
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // /onboarding への Cookie 存在チェック → /sign-in リダイレクト
  if (pathname.startsWith('/onboarding')) {
    return handleCandidateAuth(request);
  }

  // /invitations/{token} への Cookie 存在チェック → /sign-in?token={token} リダイレクト
  if (pathname.startsWith('/invitations/')) {
    return handleInvitationAuth(request);
  }

  return NextResponse.next();
}

/**
 * Better Auth セッション Cookie の有無を判定する。
 * 本番 (HTTPS) では `__Secure-` プレフィックス付き、ローカル dev (HTTP) では無し。
 * 参考: feedback_better_auth_secure_cookie_prefix.md
 */
function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.get('__Secure-better-auth.session_token') !== undefined ||
    request.cookies.get('better-auth.session_token') !== undefined
  );
}

/**
 * /onboarding 保護: Cookie が無ければ /sign-in にリダイレクト。
 * セッション有効性検証は Server Component の requireUser() が独立に行う。
 */
function handleCandidateAuth(request: NextRequest): NextResponse {
  if (!hasSessionCookie(request)) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}

/**
 * /invitations/{token} 保護: Cookie が無ければ /sign-in?token={token} にリダイレクト。
 * token は query string に引き継ぐ。token 形式検証・意味検証はページ側で行う。
 */
function handleInvitationAuth(request: NextRequest): NextResponse {
  if (hasSessionCookie(request)) {
    return NextResponse.next();
  }

  // /invitations/{token}/... から token を抽出
  // 例: /invitations/abc-123 → token = "abc-123"
  // 例: /invitations/abc-123/foo → token = "abc-123" (segment[0] のみ)
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const token = segments[1] ?? '';

  const signInUrl = new URL('/sign-in', request.url);
  if (token) {
    signInUrl.searchParams.set('token', token);
  }
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ['/onboarding', '/invitations/:path*'],
};

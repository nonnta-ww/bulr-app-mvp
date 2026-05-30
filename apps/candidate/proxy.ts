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
 *
 * やらないこと:
 *   - Better Auth セッション validation（Cookie の存在確認のみ、セッションの有効性は Server Component で requireUser() が行う）
 *   - candidate_profile の存在確認（DB クエリが必要なため、ページ側の requireCandidate() に委譲する）
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

  return NextResponse.next();
}

/**
 * 保護対象パスへのアクセスに対して Better Auth セッション Cookie の存在を確認する。
 * Cookie が存在しない場合は /sign-in にリダイレクト（UX リダイレクトのみ）。
 * Cookie が存在しても、セッションの有効性は Server Component の requireUser() が独立に検証する。
 * candidate_profile の存在確認は Server Component の requireCandidate() に委譲する（DB クエリ回避）。
 */
function handleCandidateAuth(request: NextRequest): NextResponse {
  // Better Auth のセッション Cookie 名
  // 本番 (HTTPS) では `__Secure-` プレフィックス付き、ローカル dev (HTTP) では無し
  // 参考: better-auth/dist/cookies/index.mjs の isProduction 分岐
  // 参考: feedback_better_auth_secure_cookie_prefix.md
  const sessionCookie =
    request.cookies.get('__Secure-better-auth.session_token') ??
    request.cookies.get('better-auth.session_token');

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Cookie 存在確認 OK → 次のハンドラへ
  // 実際のセッション有効性検証は Server Component の requireUser() が行う
  return NextResponse.next();
}

export const config = {
  // Task 7.2 で /invitations/:path* を追加予定
  matcher: ['/onboarding'],
};

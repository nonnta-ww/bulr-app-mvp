/**
 * @file middleware.ts (proxy)
 *
 * このファイルは UX リダイレクトのみを担当する。
 *
 * ⚠️ CVE-2025-29927 (2025 年に発覚した Next.js middleware bypass 攻撃) の教訓により、
 *    認可は本ファイルに依存してはならない。
 *    各 Server Component / Server Action / API Route で requireUser() / requireAdmin() を独立に呼び出すこと。
 *
 * やること:
 *   - /interviews/* の Cookie 存在チェック → /sign-in リダイレクト
 *   - /openings, /openings/new, /openings/:openingId* の Cookie 存在チェック → /sign-in リダイレクト
 *   - /openings/:openingId/entries, /openings/:openingId/entries/:entryId* の Cookie 存在チェック → /sign-in リダイレクト
 *
 * やらないこと:
 *   - Better Auth セッション validation（Cookie の存在確認のみ、セッションの有効性は Server Component で requireUser() が行う）
 *   - user_profile.company_id の確認（DB クエリが必要なため、各 Server Component / Server Action の requireCompanyUser() に委譲）
 *   - /admin/* の認可（monorepo-app-split Task 4.3 で /admin/* は apps/admin に移設されたため、本アプリには存在しない）
 *   - Server Action / API Route の認可
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware。
 * UX リダイレクトのみを担う。認可判定（セッション有効性 / 許可メール検査 / company 所属確認）は行わない。
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // /interviews/* および /openings/* への Cookie 存在チェック → /sign-in リダイレクト
  if (pathname.startsWith('/interviews/') || pathname === '/openings' || pathname.startsWith('/openings/')) {
    return handleInterviewerAuth(request);
  }

  return NextResponse.next();
}

/**
 * 企業ユーザー向けルートへのアクセスに対して Better Auth セッション Cookie の存在を確認する。
 * Cookie が存在しない場合は /sign-in にリダイレクト（UX リダイレクトのみ）。
 * Cookie が存在しても、セッションの有効性は Server Component の requireUser() が独立に検証する。
 * company 所属確認は DB クエリが必要なため Server Component の requireCompanyUser() に委譲する。
 */
function handleInterviewerAuth(request: NextRequest): NextResponse {
  // Better Auth のセッション Cookie 名
  // 本番 (HTTPS) では `__Secure-` プレフィックス付き、ローカル dev (HTTP) では無し
  // 参考: better-auth/dist/cookies/index.mjs の isProduction 分岐
  const sessionCookie =
    request.cookies.get('better-auth.session_token') ??
    request.cookies.get('__Secure-better-auth.session_token');

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Cookie 存在確認 OK → 次のハンドラへ
  // 実際のセッション有効性検証は Server Component の requireUser() が行う
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/interviews/:path*',
    '/openings',
    '/openings/new',
    '/openings/:openingId*',
    '/openings/:openingId/entries',
    '/openings/:openingId/entries/:entryId*',
  ],
};

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
 *
 * やらないこと:
 *   - Better Auth セッション validation（Cookie の存在確認のみ、セッションの有効性は Server Component で requireUser() が行う）
 *   - /admin/* の認可（許可メール検査は Server Component で requireAdmin() が独立に行う）
 *   - Server Action / API Route の認可
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware。
 * UX リダイレクトのみを担う。認可判定（セッション有効性 / 許可メール検査）は行わない。
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // /interviews/* への Cookie 存在チェック → /sign-in リダイレクト
  if (pathname.startsWith('/interviews/')) {
    return handleInterviewerAuth(request);
  }

  return NextResponse.next();
}

/**
 * /interviews/* へのアクセスに対して Better Auth セッション Cookie の存在を確認する。
 * Cookie が存在しない場合は /sign-in にリダイレクト（UX リダイレクトのみ）。
 * Cookie が存在しても、セッションの有効性は Server Component の requireUser() が独立に検証する。
 */
function handleInterviewerAuth(request: NextRequest): NextResponse {
  // Better Auth のセッション Cookie 名
  const sessionCookie = request.cookies.get('better-auth.session_token');

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Cookie 存在確認 OK → 次のハンドラへ
  // 実際のセッション有効性検証は Server Component の requireUser() が行う
  return NextResponse.next();
}

export const config = {
  matcher: ['/interviews/:path*'],
};

/**
 * @file middleware.ts (proxy)
 *
 * このファイルは UX リダイレクトと管理画面 Basic 認証チェックのみを担当する。
 *
 * ⚠️ CVE-2025-29927 (2025 年に発覚した Next.js middleware bypass 攻撃) の教訓により、
 *    認可は本ファイルに依存してはならない。
 *    各 Server Component / Server Action / API Route で requireUser() / requireAdmin() を独立に呼び出すこと。
 *
 * やること:
 *   - /interviews/* の Cookie 存在チェック → /sign-in リダイレクト
 *   - /admin/* の Basic 認証チェック
 *
 * やらないこと:
 *   - Better Auth セッション validation（Cookie の存在確認のみ、セッションの有効性は Server Component で requireUser() が行う）
 *   - ADMIN_ALLOWED_EMAILS 検査（許可メール検査は Server Component で requireAdmin() が行う）
 *   - Server Action / API Route の認可
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware。
 * UX リダイレクトと /admin/* に対する Basic 認証チェックのみを担う。
 * 認可判定（セッション有効性 / 許可メール検査）は行わない。
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // /admin/* への Basic 認証チェック
  if (pathname.startsWith('/admin/')) {
    return handleAdminBasicAuth(request);
  }

  // /interviews/* への Cookie 存在チェック → /sign-in リダイレクト
  if (pathname.startsWith('/interviews/')) {
    return handleInterviewerAuth(request);
  }

  return NextResponse.next();
}

/**
 * /admin/* へのアクセスに対して Basic 認証を検証する。
 * 認証情報が正しい場合は次のハンドラへ続行、失敗時は 401 を返す。
 * セッション検証・許可メール検査は行わない（多層防御の別レイヤー責務）。
 */
function handleAdminBasicAuth(request: NextRequest): NextResponse {
  const authorization = request.headers.get('Authorization');

  // Authorization ヘッダーが存在しない場合
  if (!authorization) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="bulr admin"',
      },
    });
  }

  // "Basic " プレフィックスチェック
  if (!authorization.startsWith('Basic ')) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="bulr admin"',
      },
    });
  }

  // base64 デコード
  const base64Credentials = authorization.slice('Basic '.length);
  let credentials: string;
  try {
    credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  } catch {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="bulr admin"',
      },
    });
  }

  // "user:password" 形式の検証
  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="bulr admin"',
      },
    });
  }

  const user = credentials.slice(0, colonIndex);
  const password = credentials.slice(colonIndex + 1);

  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER;
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD;

  // Stage 1: 厳密一致で照合
  if (
    !expectedUser ||
    !expectedPassword ||
    user !== expectedUser ||
    password !== expectedPassword
  ) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="bulr admin"',
      },
    });
  }

  // Basic 認証通過 → 次のハンドラへ
  // セッション検証と許可メール検査は Server Component の requireAdmin() が独立に行う
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
  matcher: ['/interviews/:path*', '/admin/:path*'],
};

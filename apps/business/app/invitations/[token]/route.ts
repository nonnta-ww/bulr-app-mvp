/**
 * 企業ユーザー招待トークン受信エンドポイント（Route Handler）
 *
 * 招待リンク（/invitations/[token]）にアクセスした企業ユーザーを処理する。
 * - 不正トークン形式: 404 (notFound)
 * - 未認証: /sign-in?token={token} へリダイレクトし、サインイン後に戻れるようにする
 * - 認証済み: pending_invitation_token cookie を HttpOnly で保存し、
 *   /invitations/[token]/confirm にリダイレクトする
 *
 * NOTE: Server Component（page.tsx）はレンダー中に Cookie を変更できない
 *       （"Cookies can only be modified in a Server Action or Route Handler"）。
 *       本エンドポイントは Cookie 設定とリダイレクトのみを行うため Route Handler として実装し、
 *       Cookie はリダイレクトレスポンス（NextResponse）に直接付与する。
 *
 * NOTE: 候補者版（apps/candidate/app/invitations/[token]/route.ts）を参考に実装。
 *       business 版はサインイン済みの場合の遷移先が /invitations/[token]/confirm になる点が異なる。
 *
 * Requirements: 2.4, 6.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { getCurrentUser } from '@bulr/auth/server';

/**
 * トークンの形式バリデーション用スキーマ。
 * 英数字・ハイフン・アンダースコアのみ許可し、最大 256 文字。
 * トークンの意味（DB 上の招待レコード）は本エンドポイントでは検証しない。
 */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).max(256);

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { token } = await params;

  // トークン形式を検証する（不正な場合は 404 を返す）
  const result = tokenSchema.safeParse(token);
  if (!result.success) {
    notFound();
  }

  const user = await getCurrentUser();

  if (user === null) {
    // 未認証: sign-in ページへリダイレクト（?token= でトークンを引き渡す）
    return NextResponse.redirect(
      new URL('/sign-in?token=' + encodeURIComponent(token), request.url),
    );
  }

  // 認証済み: pending_invitation_token cookie をリダイレクトレスポンスに付与し、
  // 確認ページへリダイレクトする
  const response = NextResponse.redirect(
    new URL(`/invitations/${token}/confirm`, request.url),
  );

  response.cookies.set('pending_invitation_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });

  return response;
}

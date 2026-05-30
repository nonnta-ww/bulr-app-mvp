/**
 * 招待トークン受信ページ（Server Component）
 *
 * 招待リンク（/invitations/[token]）にアクセスした候補者を処理する。
 * - 未認証: /sign-in?token={token} へリダイレクトし、サインイン後に戻れるようにする。
 * - 認証済み: pending_invitation_token cookie を HttpOnly で保存し、
 *   candidate_profile の有無に応じて /onboarding または / にリダイレクトする。
 *
 * NOTE: 招待エンティティの検証・entry 作成は Wave 3（company-and-opening / entry-flow）で行う。
 *       本ページはトークンを cookie に保存するだけで、トークンの意味は検証しない。
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getCurrentUser } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';

/**
 * トークンの形式バリデーション用スキーマ。
 * 英数字・ハイフン・アンダースコアのみ許可し、最大 256 文字。
 * トークンの意味（DB上の招待レコード）は本コンポーネントでは検証しない。
 */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).max(256);

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationTokenPage({ params }: PageProps) {
  const { token } = await params;

  // トークン形式を検証する（不正な場合は 404 を返す）
  const result = tokenSchema.safeParse(token);
  if (!result.success) {
    notFound();
  }

  const user = await getCurrentUser();

  if (user === null) {
    // 未認証: sign-in ページへリダイレクト（?token= でトークンを引き渡す）
    redirect('/sign-in?token=' + encodeURIComponent(token));
  }

  // 認証済み: pending_invitation_token cookie を設定する
  const cookieStore = await cookies();
  cookieStore.set('pending_invitation_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });

  // candidate_profile の有無を確認し、存在しない場合は /onboarding へ
  const [existing] = await db
    .select()
    .from(candidateProfile)
    .where(eq(candidateProfile.userId, user.id))
    .limit(1);

  if (!existing) {
    redirect('/onboarding');
  }

  redirect('/');
}

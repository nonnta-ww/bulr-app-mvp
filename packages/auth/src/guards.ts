/**
 * 認証ヘルパー（guards.ts）
 *
 * このファイルは Server Component / Server Action / API Route から呼び出す
 * 認証・認可ユーティリティを提供する。
 *
 * CVE-2025-29927 教訓: proxy.ts の bypass 攻撃があっても、各レイヤーで
 * requireUser() / requireAdmin() を独立して呼び出すことでデータを露出しない。
 *
 * Requirements: 3.8, 4.3, 4.7, 5.1-5.5, 6.8, 10.7, 10.8
 */

import 'server-only';

import { headers } from 'next/headers';

import { auth } from './server';
import { AuthError } from './errors';

// AuthError は ./errors に集約済み。後方互換のため re-export する
// （既存 `apps/web` 側 `import { AuthError } from '@/lib/guards'` への配慮）。
export { AuthError };
export type { AuthErrorCode } from './errors';

// ---------------------------------------------------------------------------
// getCurrentUser — throw しない、null を返す
// ---------------------------------------------------------------------------

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
}

// ---------------------------------------------------------------------------
// requireUser — 未認証なら UNAUTHORIZED を throw
// ---------------------------------------------------------------------------

export async function requireUser(): Promise<{ id: string; email: string }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('UNAUTHORIZED');
  return user;
}

// ---------------------------------------------------------------------------
// requireAdmin — requireUser → ADMIN_ALLOWED_EMAILS チェック（fail secure）
// ---------------------------------------------------------------------------

export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const user = await requireUser();
  const allowed =
    process.env.ADMIN_ALLOWED_EMAILS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  // 空配列またはメールが含まれない場合は拒否（fail secure）
  if (allowed.length === 0 || !allowed.includes(user.email)) {
    throw new AuthError('FORBIDDEN');
  }
  return user;
}

// ---------------------------------------------------------------------------
// requireSessionOwnership — セッション所有権チェック
// ---------------------------------------------------------------------------

export function requireSessionOwnership(
  session: { interviewerId: string } | null | undefined,
  userId: string,
): void {
  if (!session) throw new AuthError('NOT_FOUND');
  if (session.interviewerId !== userId) throw new AuthError('FORBIDDEN');
}

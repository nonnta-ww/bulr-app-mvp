/**
 * 面接官サインインページ（Server Component）
 *
 * サインイン済みユーザーが訪問した場合は /interviews にリダイレクトする。
 * ?token= が付いている場合、すでに認証済みならそのまま招待フローへ進む。
 * フォーム描画は SignInForm（Client Component）に委譲する。
 *
 * Requirements: 1.8, 2.4, 8.2, 8.4, 11.1-11.4, 11.7
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getCurrentUser } from '@bulr/auth/server';
import { SignInForm } from './sign-in-form';

// ページ Props（Next.js 16: searchParams は Promise）
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** searchParams の配列を正規化して先頭要素のみ返す */
function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** トークン形式の簡易バリデーション（英数字 / ハイフン / アンダースコア、最大 256 文字） */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).max(256);

export default async function SignInPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const rawToken = firstString(rawParams['token']);
  const token = rawToken && tokenSchema.safeParse(rawToken).success ? rawToken : undefined;

  const user = await getCurrentUser();
  if (user !== null) {
    // 既にサインイン済みで招待トークンがある場合は招待フローへ誘導する（Req 2.4）
    if (token) {
      redirect(`/invitations/${token}`);
    }
    redirect('/interviews');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-[32px] font-bold tracking-tight text-ink">bulr</span>
        </div>
        <SignInForm token={token} />
      </div>
    </main>
  );
}

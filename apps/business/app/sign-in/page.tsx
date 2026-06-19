/**
 * 面接官サインインページ（Server Component）
 *
 * サインイン済みユーザーが訪問した場合は /interviews にリダイレクトする。
 * フォーム描画は SignInForm（Client Component）に委譲する。
 *
 * Requirements: 1.8, 8.2, 8.4, 11.1-11.4, 11.7
 */

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@bulr/auth/server';
import { SignInForm } from './sign-in-form';

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user !== null) {
    redirect('/interviews');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-[32px] font-bold tracking-tight text-ink">bulr</span>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}

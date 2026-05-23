/**
 * 面接官サインインページ（Server Component）
 *
 * サインイン済みユーザーが訪問した場合は /interviews にリダイレクトする。
 * フォーム描画は SignInForm（Client Component）に委譲する。
 *
 * Requirements: 1.8, 8.2, 8.4, 11.1-11.4, 11.7
 */

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@bulr/auth';
import { SignInForm } from './sign-in-form';

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user !== null) {
    redirect('/interviews');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">bulr にサインイン</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          メールアドレスを入力すると Magic Link をお送りします
        </p>
        <SignInForm />
      </div>
    </main>
  );
}

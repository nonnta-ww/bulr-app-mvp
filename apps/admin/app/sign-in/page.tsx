/**
 * 管理者サインインページ（Server Component）
 *
 * apps/admin のサインインエントリ。Magic Link でメールアドレスを入力させ、
 * Better Auth が `sign-in/magic-link` 経由でリンクメールを送る。
 * サインイン後の許可メール検査（ADMIN_ALLOWED_EMAILS）は、保護ルート側の
 * `requireAdmin()` が独立に行う。本ページ自体は `requireAdmin` の対象外で、
 * 未認証ユーザでも到達できる。
 *
 * Task 4.3 で `/sessions` 配下が移設された後、サインイン済みかつ許可メールの
 * ユーザは `/sessions` に進める。本タスクでは保護ルートが未配置のため、
 * サインイン後の遷移先は単に `/`（プレースホルダ）に向ける。
 *
 * Requirements: 3.2, 3.3, 3.9, 6.4
 */

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@bulr/auth/server';
import { SignInForm } from './sign-in-form';

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user !== null) {
    // 既にサインイン済みなら admin top（Task 4.3 で /sessions に置き換え予定）
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">bulr admin</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          管理者メールアドレスを入力すると Magic Link をお送りします
        </p>
        <SignInForm />
        <p className="mt-6 text-center text-xs text-gray-400">
          許可されたメールアドレスのみ管理画面にアクセスできます
        </p>
      </div>
    </main>
  );
}

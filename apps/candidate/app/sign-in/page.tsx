/**
 * 候補者サインインページ（Server Component）
 *
 * apps/candidate のサインインエントリ。Magic Link でメールアドレスを入力させ、
 * Better Auth が `sign-in/magic-link` 経由でリンクメールを送る。
 * Wave 1 時点ではロール判定（candidate_profile 必須化）を行わず、サインイン済みの
 * ユーザを誰でも受け入れる。候補者ロール判定は Wave 2 の `candidate-auth-onboarding`
 * で導入予定。
 *
 * サインイン済みのユーザが本ページに到達した場合は `/`（プレースホルダ）へ
 * リダイレクトする。本ページ自体は誰でも到達可能で、未認証ユーザも入力できる。
 *
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 6.4
 */

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@bulr/auth/server';
import { SignInForm } from './sign-in-form';

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user !== null) {
    // 既にサインイン済みなら候補者ポータルのトップへ。
    // Wave 1 ではプレースホルダ画面のみ。Wave 2 以降で候補者導線が拡張される。
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">bulr に参加する</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          メールアドレスを入力してください。サインインリンクをお送りします。
        </p>
        <SignInForm />
        <p className="mt-6 text-center text-xs text-gray-400">
          サインインすると候補者ポータルにアクセスできます
        </p>
      </div>
    </main>
  );
}

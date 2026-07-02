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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      {/* 装飾: ドットグリッド背景 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#DCE3EC 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative z-10 w-full max-w-[400px]">
        <SignInForm />
      </div>
    </main>
  );
}

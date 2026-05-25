/**
 * Header — apps/admin 全ページ共通の上部バー
 *
 * Server Component。`getCurrentUser()` で認証状態を確認し、未認証時は null を返す
 * （/sign-in ページでは Header が描画されない）。サインイン済みなら email と
 * ログアウトボタンを右端に表示する。
 *
 * monorepo-app-split Amendment (2026-05-25): 新設アプリの logout UI 提供。
 *
 * Requirements: 2.5
 */

import { getCurrentUser } from '@bulr/auth/server';

import { SignOutButton } from './sign-out-button';

type Props = {
  title: string;
};

export async function Header({ title }: Props) {
  const user = await getCurrentUser();
  if (user === null) {
    return null;
  }
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
        <div className="text-sm font-semibold text-gray-700">{title}</div>
        <SignOutButton email={user.email} />
      </div>
    </header>
  );
}

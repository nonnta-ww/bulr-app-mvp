/**
 * Header — apps/admin 全ページ共通の上部バー
 *
 * Server Component。`getCurrentUser()` で認証状態を確認し、未認証時は null を返す
 * （/sign-in ページでは Header が描画されない）。サインイン済みなら email と
 * ログアウトボタンを右端に表示する。
 * NavLinks（Client Component）でグローバルナビゲーションタブを表示する。
 *
 * monorepo-app-split Amendment (2026-05-25): 新設アプリの logout UI 提供。
 * admin-operations Task 15.1: ナビゲーションタブ追加。
 *
 * Requirements: 2.5, 6.1, 6.6
 */

import { getCurrentUser } from '@bulr/auth/server';

import { NavLinks } from './nav-links';
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 上段: タイトル + サインアウト */}
        <div className="flex items-center justify-between py-2">
          <div className="text-sm font-semibold text-gray-700">{title}</div>
          <SignOutButton email={user.email} />
        </div>
        {/* 下段: グローバルナビゲーション */}
        <div className="pb-2">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}

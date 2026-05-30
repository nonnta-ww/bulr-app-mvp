'use client';

/**
 * SignOutButton — ヘッダー右端の email + ログアウトボタン
 *
 * monorepo-app-split Amendment (2026-05-25, smoke test 7.4 中追加):
 * Wave 1 完了時点で apps/admin・apps/candidate にログアウト UI が存在しなかったため
 * 最小構成で追加した。business 側の `components/app-shell/user-menu.tsx` と比べて
 * Sidebar + Popover を持たず、Header に inline で email + ボタンだけを表示する。
 *
 * Requirements: 2.5（機能等価性: 元 apps/web の interviewer に logout があった点を踏まえ、
 * Wave 1 で新設した admin / candidate にも最小 logout を提供）
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { signOut } from '@bulr/auth/client';

type Props = {
  email: string;
};

export function SignOutButton({ email }: Props) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      router.push('/sign-in');
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="max-w-[16rem] truncate text-gray-600" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        aria-label="ログアウト"
        className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {busy ? 'ログアウト中...' : 'ログアウト'}
      </button>
    </div>
  );
}

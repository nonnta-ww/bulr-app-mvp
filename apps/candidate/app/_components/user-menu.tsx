'use client';

/**
 * UserMenu — 上部バー右端のユーザーアイコン + ドロップダウン
 *
 * ユーザーアイコン（メール頭文字のアバター）クリックで下方向にメニューを開き、
 * メールアドレスとログアウトを表示する。メニュー外クリック / Esc で閉じる。
 *
 * 旧 SignOutButton（email + ボタンを inline 表示）を置き換える。
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';

import { signOut } from '@bulr/auth/client';

type Props = {
  email: string;
};

export function UserMenu({ email }: Props) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setOpen(false);
      router.push('/sign-in');
      router.refresh();
    }
  }

  const initial = email.charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ユーザーメニュー"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-40 w-56 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div
            className="truncate border-b border-gray-100 px-3 py-2 text-xs text-gray-500"
            title={email}
          >
            {email}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{signingOut ? 'ログアウト中...' : 'ログアウト'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * UserMenu — サイドバー下端のユーザーアイコン + ポップオーバー
 *
 * クリックで上方向にポップオーバーを開き、メールアドレスと
 * ログアウトボタンを表示する。
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { signOut } from '@bulr/auth/client';

type Props = {
  email: string;
  collapsed: boolean;
};

export function UserMenu({ email, collapsed }: Props) {
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
      if (event.key === 'Escape') {
        setOpen(false);
      }
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
    <div ref={containerRef} className="relative mt-auto border-t border-hairline p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ユーザーメニュー"
        className={
          (collapsed ? 'justify-center ' : '') +
          'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/5'
        }
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-medium text-white">
          {initial}
        </span>
        {!collapsed && (
          <span className="truncate text-sm text-body" title={email}>
            {email}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-14 left-3 z-30 w-56 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500 truncate" title={email}>
            {email}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <LogoutIcon />
            <span>{signingOut ? 'ログアウト中...' : 'ログアウト'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

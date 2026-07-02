'use client';

/**
 * SidebarUser — navy サイドバー下部のユーザーボタン + 上方向ドロップダウン。
 *
 * アバター（メール頭文字）+ メール + more_horiz を表示し、クリックで上方向に
 * メニューを開いてログアウトを提供する。メニュー外クリック / Esc で閉じる。
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { signOut } from '@bulr/auth/client';

type Props = {
  email: string;
};

export function SidebarUser({ email }: Props) {
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
        className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/10"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-canvas" title={email}>
            {email}
          </p>
          <p className="text-xs text-slate">アカウント</p>
        </div>
        <span className="material-symbols-outlined text-slate" aria-hidden="true">
          more_horiz
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-full overflow-hidden rounded-lg border border-hairline bg-card shadow-lg"
        >
          <div className="truncate border-b border-hairline px-3 py-2 text-xs text-muted" title={email}>
            {email}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-body transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              logout
            </span>
            <span>{signingOut ? 'ログアウト中...' : 'ログアウト'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

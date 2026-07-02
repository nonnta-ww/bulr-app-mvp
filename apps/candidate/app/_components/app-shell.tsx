'use client';

/**
 * AppShell — apps/candidate のアプリ枠（navy 固定サイドバー＋本文）。
 *
 * - userEmail === null（未認証）/ '/sign-in' / '/onboarding' では枠を描画せず children のみ返す。
 * - デスクトップ（md+）: navy サイドバーを画面左に固定表示（本文は md:ml-64）。
 * - モバイル（<md）: サイドバーは隠れ、上部バーの ☰ でオーバーレイ drawer。
 *   リンク選択 / 背景 / Esc で閉じる。
 *
 * 注意: 各ページが独自の <main> を持つため、本シェルの本文ラッパは <div>（<main> の入れ子回避）。
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { Sidebar } from './sidebar';

const CHROMELESS_PATHS = ['/sign-in', '/onboarding', '/invitations'];

interface AppShellProps {
  userEmail: string | null;
  children: React.ReactNode;
}

export function AppShell({ userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ルート変更でモバイル drawer を閉じる
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Esc でモバイル drawer を閉じる
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // 未認証・サインイン・オンボーディングでは枠を出さない（userEmail を string に絞り込む）
  if (userEmail === null) return <>{children}</>;
  if (CHROMELESS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      {/* デスクトップ: navy 固定サイドバー */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-64 md:block">
        <Sidebar email={userEmail} />
      </aside>

      {/* モバイル: 上部バー */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-card px-4 py-3 md:hidden">
        <span className="text-xl font-bold text-primary">bulr</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="メニューを開く"
          className="text-navy"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            menu
          </span>
        </button>
      </header>

      {/* モバイル drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-64 shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="メニューを閉じる"
              className="absolute right-3 top-4 z-10 text-slate hover:text-canvas"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
            <Sidebar email={userEmail} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* 本文（各ページが自前の <main> を持つため <div> ラッパ） */}
      <div className="min-w-0 md:ml-64">{children}</div>
    </div>
  );
}

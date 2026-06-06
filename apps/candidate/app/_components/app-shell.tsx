'use client';

/**
 * AppShell — apps/candidate のアプリ枠（上部バー＋左サイドバー＋本文）。
 *
 * - userEmail === null（未認証）/ '/sign-in' / '/onboarding' では枠を描画せず children のみ返す。
 * - デスクトップ（md+）: サイドバー常時表示。☰ で展開↔アイコンレールをトグルし localStorage に保存。
 * - モバイル（<md）: サイドバーは隠れ、☰ でオーバーレイ drawer。リンク選択 / 背景 / Esc で閉じる。
 *
 * 注意: 各ページが独自の <main> を持つため、本シェルの本文ラッパは <div>（<main> の入れ子回避）。
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

import { SignOutButton } from './sign-out-button';
import { Sidebar } from './sidebar';

const COLLAPSE_KEY = 'bulr.nav.collapsed';
const CHROMELESS_PATHS = ['/sign-in', '/onboarding'];

interface AppShellProps {
  userEmail: string | null;
  children: React.ReactNode;
}

export function AppShell({ userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 折りたたみ設定を復元（初回マウント時）
  useEffect(() => {
    if (window.localStorage.getItem(COLLAPSE_KEY) === '1') {
      setCollapsed(true);
    }
  }, []);

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

  function toggleDesktop() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* 上部バー */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          {/* モバイル: drawer を開く */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="メニューを開く"
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* デスクトップ: 展開↔レール */}
          <button
            type="button"
            onClick={toggleDesktop}
            aria-label={collapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
            aria-expanded={!collapsed}
            className="hidden rounded-md p-1.5 text-gray-600 hover:bg-gray-100 md:inline-flex"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-gray-800">bulr</span>
        </div>
        <SignOutButton email={userEmail} />
      </header>

      <div className="flex flex-1">
        {/* デスクトップ・サイドバー */}
        <aside
          className={[
            'hidden shrink-0 border-r border-gray-200 bg-white md:block',
            collapsed ? 'w-16' : 'w-56',
          ].join(' ')}
        >
          <Sidebar collapsed={collapsed} />
        </aside>

        {/* モバイル drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
                <span className="text-sm font-semibold text-gray-800">メニュー</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="メニューを閉じる"
                  className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* 本文（各ページが自前の <main> を持つため <div> ラッパ） */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

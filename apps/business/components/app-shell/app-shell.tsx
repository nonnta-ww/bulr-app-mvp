'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 *
 * - デスクトップ (>= 768px): collapsed (icon-only 56px) ↔ expanded (224px)
 * - モバイル (< 768px): 常に icon-only。トグルで overlay-drawer が前面に出現
 * - collapsed 状態は cookie で永続化（デスクトップ表示時のみ）
 */

import { useEffect, useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

const COOKIE_NAME = 'sidebar-collapsed';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MOBILE_QUERY = '(max-width: 767px)';

function persistCollapsed(collapsed: boolean) {
  if (typeof document === 'undefined') return;
  if (collapsed) {
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } else {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

export function AppShell({ email, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMobile, mobileOpen]);

  function handleToggle() {
    if (isMobile) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  // モバイル時はベース表示を常に icon-only に固定し、overlay は別レイヤーで描画する
  const baseCollapsed = isMobile ? true : collapsed;
  const overlayExpanded = isMobile && mobileOpen;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={baseCollapsed} onToggle={handleToggle} email={email} />
      {overlayExpanded && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl">
            <Sidebar collapsed={false} onToggle={handleToggle} email={email} />
          </div>
        </>
      )}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

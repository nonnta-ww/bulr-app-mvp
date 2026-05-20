'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 *
 * collapsed 状態は document.cookie で永続化（SSR 側で next/headers cookies() から読む）。
 */

import { useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

const COOKIE_NAME = 'sidebar-collapsed';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} email={email} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

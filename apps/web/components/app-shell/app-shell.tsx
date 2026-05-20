'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 */

import { useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ email: _email, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

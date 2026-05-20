'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 *
 * このタスク時点では最小スケルトン。サイドバー UI は後続タスクで実装。
 */

import { useState } from 'react';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ email, initialCollapsed, children }: Props) {
  const [collapsed, _setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside
        className={
          collapsed
            ? 'w-14 shrink-0 flex flex-col bg-white border-r border-gray-200'
            : 'w-56 shrink-0 flex flex-col bg-white border-r border-gray-200'
        }
        data-testid="app-shell-sidebar"
      >
        <div className="px-4 py-4 text-sm font-semibold">bulr</div>
        <div className="mt-auto px-3 py-3 text-xs text-gray-500 truncate" title={email}>
          {email}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

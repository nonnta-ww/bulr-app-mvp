'use client';

/**
 * Sidebar — ナビ項目を描画する presentational Client Component。
 * collapsed=true でアイコンのみ（ラベルは title 属性でツールチップ）。
 * onNavigate はモバイル drawer をリンク選択時に閉じるためのコールバック。
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS, isActive } from './nav-items';

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="メインナビゲーション" className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={[
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              collapsed ? 'justify-center' : '',
              active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

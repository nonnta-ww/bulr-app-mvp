'use client';

/**
 * Sidebar — navy 固定サイドバーの中身（ブランド + ナビ + 下部ユーザーボタン）。
 * デスクトップの固定 aside とモバイル drawer の両方で再利用する。
 * onNavigate はモバイル drawer をリンク選択時に閉じるためのコールバック。
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS, isActive } from './nav-items';
import { SidebarUser } from './user-menu';

interface SidebarProps {
  email: string;
  onNavigate?: () => void;
}

export function Sidebar({ email, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-navy py-6">
      {/* ブランド */}
      <div className="mb-6 px-6">
        <p className="text-2xl font-bold leading-tight text-canvas">bulr</p>
        <p className="text-xs text-slate">Software Engineer Growth</p>
      </div>

      {/* ナビゲーション */}
      <nav aria-label="メインナビゲーション" className="flex-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={[
                'mb-1 flex items-center gap-4 rounded-r-full border-l-4 px-4 py-3 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary/20 font-bold text-canvas'
                  : 'border-transparent text-slate hover:bg-white/10 hover:text-canvas',
              ].join(' ')}
            >
              <span
                className={`material-symbols-outlined${active ? ' fill' : ''}`}
                aria-hidden="true"
              >
                {item.symbol}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 下部ユーザーボタン */}
      <div className="mt-auto border-t border-white/10 px-3 pt-4">
        <SidebarUser email={email} />
      </div>
    </div>
  );
}

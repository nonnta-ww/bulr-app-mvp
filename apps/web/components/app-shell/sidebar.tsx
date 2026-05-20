'use client';

/**
 * Sidebar — ロゴ・トグル・ナビ項目・ユーザーメニュー
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

const NAV_ITEMS = [
  { href: '/interviews', label: '面接セッション', match: /^\/interviews(\/|$)/, icon: ClipboardIcon },
  { href: '/settings', label: '設定', match: /^\/settings(\/|$)/, icon: GearIcon },
] as const;

export function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();
  return (
    <aside
      className={
        (collapsed ? 'w-14 items-center ' : 'w-56 ') +
        'shrink-0 flex flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-out'
      }
      data-testid="app-shell-sidebar"
    >
      <div
        className={
          (collapsed ? 'justify-center ' : 'justify-between ') +
          'flex items-center px-4 py-4 border-b border-gray-100 w-full'
        }
      >
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-gray-900">bulr</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label="サイドバーを開閉"
          aria-expanded={!collapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      <nav className={(collapsed ? 'px-1 ' : 'px-2 ') + 'flex flex-col gap-1 py-3 w-full'}>
        {NAV_ITEMS.map((item) => {
          const active = item.match.test(pathname ?? '');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={
                (collapsed ? 'justify-center ' : '') +
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ' +
                (active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100')
              }
            >
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
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
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="4" width="8" height="3" rx="1" />
      <path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

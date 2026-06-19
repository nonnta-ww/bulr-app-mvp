'use client';

/**
 * Sidebar — ブランド・CTA・ナビ項目・ユーザーメニュー
 *
 * docs/design (bulr business) に合わせたデザイン:
 * - ブランド: navy ロゴ + "bulr business" / "Engineering Hiring"
 * - navy CTA「新規募集作成」
 * - Material Symbols のナビアイコン、アクティブは nav-active 背景
 * collapsed 時はアイコンのみ表示する挙動を維持。
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/icon';

import { UserMenu } from './user-menu';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  email: string;
};

const NAV_ITEMS = [
  { href: '/interviews', label: '面接セッション', match: /^\/interviews(\/|$)/, icon: 'video_chat' },
  { href: '/openings', label: '募集', match: /^\/openings(\/|$)/, icon: 'work' },
  { href: '/settings', label: '設定', match: /^\/settings(\/|$)/, icon: 'settings' },
] as const;

export function Sidebar({ collapsed, onToggle, email }: Props) {
  const pathname = usePathname();
  return (
    <aside
      className={
        (collapsed ? 'w-16 items-center ' : 'w-64 ') +
        'shrink-0 flex flex-col bg-sidebar border-r border-hairline transition-[width] duration-200 ease-out'
      }
      data-testid="app-shell-sidebar"
    >
      {/* ブランド + トグル */}
      <div
        className={
          (collapsed ? 'justify-center px-2 ' : 'justify-between px-5 ') +
          'flex items-center py-5 w-full'
        }
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-base font-bold text-white">
              b
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-tight text-ink">
                bulr business
              </span>
              <span className="block text-[11px] text-muted">Engineering Hiring</span>
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label="サイドバーを開閉"
          aria-expanded={!collapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
        >
          <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} size={20} />
        </button>
      </div>

      {/* CTA */}
      <div className={(collapsed ? 'px-2 ' : 'px-4 ') + 'pb-5 w-full'}>
        <Link
          href="/openings/new"
          title={collapsed ? '新規募集作成' : undefined}
          className={
            (collapsed ? 'justify-center px-0 ' : 'px-4 ') +
            'flex h-11 items-center gap-2 rounded-lg bg-navy text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-soft'
          }
        >
          <Icon name="add" size={20} />
          {!collapsed && <span>新規募集作成</span>}
        </Link>
      </div>

      {/* ナビ */}
      <nav className={(collapsed ? 'px-2 ' : 'px-3 ') + 'flex flex-1 flex-col gap-1 w-full'}>
        {NAV_ITEMS.map((item) => {
          const active = item.match.test(pathname ?? '');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={
                (collapsed ? 'justify-center ' : '') +
                'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm transition-colors ' +
                (active
                  ? 'bg-nav-active font-bold text-nav-active-ink'
                  : 'text-body hover:bg-black/5')
              }
            >
              <Icon name={item.icon} fill={active} size={22} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <UserMenu email={email} collapsed={collapsed} />
    </aside>
  );
}

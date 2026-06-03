/**
 * NavLinks — 管理画面グローバルナビゲーション（Client Component）
 *
 * `usePathname()` でアクティブルートを判定し、該当タブをハイライトする。
 * 各 href は先頭一致（startsWith）でアクティブ判定する。
 *
 * Requirements: 6.1, 6.6
 * Boundary: このファイルのみ（Header から呼び出す）
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'セッション', href: '/sessions' },
  { label: '候補者', href: '/candidates' },
  { label: '企業', href: '/companies' },
  { label: 'マスタ', href: '/masters/skill-survey' },
  { label: 'パターン', href: '/masters/assessment-pattern' },
  { label: '監視', href: '/monitoring' },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {NAV_ITEMS.map(({ label, href }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={[
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

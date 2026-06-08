import {
  Home,
  ClipboardList,
  BarChart3,
  FileText,
  MessageSquare,
  Send,
  type LucideIcon,
} from 'lucide-react';

/** ナビ項目。match は現在地判定の方式（'/' のみ exact、他は prefix）。 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match: 'exact' | 'prefix';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'ホーム', href: '/', icon: Home, match: 'exact' },
  { label: 'スキルアンケート', href: '/skill-survey', icon: ClipboardList, match: 'prefix' },
  { label: '自己分析', href: '/self-analysis', icon: BarChart3, match: 'prefix' },
  { label: '履歴書', href: '/resume', icon: FileText, match: 'prefix' },
  { label: '模擬面接', href: '/mock-interview', icon: MessageSquare, match: 'prefix' },
  { label: 'エントリー', href: '/entries', icon: Send, match: 'prefix' },
];

/**
 * 現在地がナビ項目に一致するか。
 * - exact: 完全一致のみ（'/' が全ページに一致しないように）
 * - prefix: 自身 or 配下（'/skill-survey/xxx' でも親が点灯）
 */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

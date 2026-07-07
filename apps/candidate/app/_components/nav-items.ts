/** ナビ項目。match は現在地判定の方式（'/' のみ exact、他は prefix）。 */
export interface NavItem {
  label: string;
  href: string;
  /** Material Symbols のアイコン名 */
  symbol: string;
  match: 'exact' | 'prefix';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'ホーム', href: '/', symbol: 'home', match: 'exact' },
  { label: 'スキルアンケート', href: '/skill-survey', symbol: 'assessment', match: 'prefix' },
  { label: '自己分析', href: '/self-analysis', symbol: 'psychology', match: 'prefix' },
  { label: 'クラス診断', href: '/class-diagnosis', symbol: 'swords', match: 'prefix' },
  { label: '履歴書', href: '/resume', symbol: 'description', match: 'prefix' },
  { label: '模擬面接', href: '/mock-interview', symbol: 'forum', match: 'prefix' },
  { label: 'エントリー', href: '/entries', symbol: 'send', match: 'prefix' },
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

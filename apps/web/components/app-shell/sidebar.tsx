'use client';

/**
 * Sidebar — ロゴ・トグル・ナビ項目・ユーザーメニュー
 *
 * このタスクでは brand 行とトグルボタンのみ実装。
 * ナビ項目・UserMenu は後続タスク。
 */

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ collapsed, onToggle }: Props) {
  return (
    <aside
      className={
        (collapsed
          ? 'w-14 items-center '
          : 'w-56 ') +
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

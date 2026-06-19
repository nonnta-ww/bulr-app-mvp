/**
 * Badge — ステータスを表す pill。
 *
 * docs/design のステータスバッジ配色に揃える。
 * tone でセマンティックに色を選択する。
 */

export type BadgeTone = 'success' | 'warning' | 'neutral' | 'muted' | 'info' | 'danger';

const TONE_CLASS: Record<BadgeTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-copper border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  muted: 'bg-slate-100 text-slate-500 border-slate-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

const DOT_CLASS: Record<BadgeTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-copper',
  info: 'bg-blue-500',
  neutral: 'bg-gray-400',
  muted: 'bg-slate-400',
  danger: 'bg-red-500',
};

type Props = {
  tone?: BadgeTone;
  /** 先頭に状態ドットを表示する */
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function Badge({ tone = 'neutral', dot, children, className }: Props) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ' +
        TONE_CLASS[tone] +
        (className ? ` ${className}` : '')
      }
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[tone]}`} />}
      {children}
    </span>
  );
}

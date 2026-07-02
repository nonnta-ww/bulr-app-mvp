/**
 * QuotaStatus — 模擬面接の月次利用枠残数カード
 *
 * Server Component（presentational）。
 * - 「今月の残り回数」+ 残数 / 上限 + 進捗バー + リセット注記
 * - remaining === 0 のときは上限到達の警告テキストを添える
 *
 * Requirements: 要件1
 */

interface Props {
  remaining: number;
  /** 月次上限（既定 3） */
  total?: number;
}

export function QuotaStatus({ remaining, total = 3 }: Props) {
  const clamped = Math.max(0, Math.min(remaining, total));
  const percent = total > 0 ? (clamped / total) * 100 : 0;
  const depleted = remaining <= 0;

  return (
    <div className="rounded-card border border-hairline bg-card p-6 shadow-ambient">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">今月の残り回数</p>
        <span className="material-symbols-outlined text-slate" aria-hidden="true">
          event_available
        </span>
      </div>

      <p className="mt-2">
        <span className="text-3xl font-bold text-ink tabular-nums">{clamped}</span>
        <span className="ml-1 text-sm text-muted">/ {total} 回</span>
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${depleted ? 'bg-ember' : 'bg-primary'}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {depleted ? (
        <p role="alert" className="mt-2 text-xs font-medium text-ember">
          今月の上限に達しました
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">毎月1日に回数がリセットされます。</p>
      )}
    </div>
  );
}

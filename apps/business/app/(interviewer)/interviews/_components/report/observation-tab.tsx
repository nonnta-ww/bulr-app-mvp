/**
 * 観察タブ（B-1: 深掘り到達 / 詰まり・未到達 の 2 列）
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §5
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import { PatternRow } from './pattern-row';

type Pattern = HeatmapData['patterns'][number];

function byReachedThenAuthenticity(a: Pattern, b: Pattern): number {
  return (
    b.level_reached - a.level_reached ||
    b.scores.authenticity - a.scores.authenticity
  );
}

interface Props {
  patterns: HeatmapData['patterns'];
  onSelectPattern: (patternId: string) => void;
}

export function ObservationTab({ patterns, onSelectPattern }: Props) {
  const reached = patterns
    .filter((p) => p.stuck_type === null && p.level_reached >= 2)
    .sort(byReachedThenAuthenticity);
  const stuck = patterns
    .filter((p) => !(p.stuck_type === null && p.level_reached >= 2))
    .sort(byReachedThenAuthenticity);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Column title="深掘り到達" count={reached.length} accent="reached">
        {reached.length === 0 ? (
          <EmptyHint text="到達したパターンがありません" />
        ) : (
          reached.map((p) => (
            <PatternRow
              key={p.pattern_id}
              pattern={p}
              variant="reached"
              onSelect={onSelectPattern}
            />
          ))
        )}
      </Column>
      <Column title="詰まり・未到達" count={stuck.length} accent="stuck">
        {stuck.length === 0 ? (
          <EmptyHint text="詰まり・未到達はありません" />
        ) : (
          stuck.map((p) => (
            <PatternRow
              key={p.pattern_id}
              pattern={p}
              variant="stuck"
              onSelect={onSelectPattern}
            />
          ))
        )}
      </Column>
    </div>
  );
}

function Column({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: 'reached' | 'stuck';
  children: React.ReactNode;
}) {
  const borderClass = accent === 'reached' ? 'border-t-copper' : 'border-t-slate-400';
  return (
    <div className={`rounded-lg border border-hairline border-t-2 ${borderClass} bg-canvas p-3`}>
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-bold text-ink">{title}</span>
        <span className="text-muted">{count}件</span>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-4 text-center text-xs italic text-muted">{text}</p>;
}

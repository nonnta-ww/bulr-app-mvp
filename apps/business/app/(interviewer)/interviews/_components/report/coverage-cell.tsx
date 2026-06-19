/**
 * カバレッジタブの 1 セル。
 * 到達済み = 色付き、未到達 = グレー（クリック不可）。
 */

import type { HeatmapData } from '@bulr/types/evaluation';

type Pattern = HeatmapData['patterns'][number];

interface Props {
  pattern: Pattern | null;
  fallbackCode: string; // 未到達セルの表示コード（例: 'D6'）
  onSelect: (patternId: string) => void;
}

// docs/design のヒートマップに合わせた copper 濃淡スケール（低 → 高）
const CELL_COLOR_BY_LEVEL: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-canvas text-muted cursor-default',
  1: 'bg-[#f0e3cf] text-[#8a6a37]',
  2: 'bg-[#e2c596] text-[#6b4a1f]',
  3: 'bg-[#d09a55] text-white',
  4: 'bg-[#a8702f] text-white',
};

const STUCK_COLOR = 'bg-slate-400 text-white';

export function CoverageCell({ pattern, fallbackCode, onSelect }: Props) {
  if (!pattern) {
    return (
      <div
        className={`flex aspect-square items-center justify-center rounded text-[9px] font-bold font-mono ${CELL_COLOR_BY_LEVEL[0]}`}
        aria-label={`${fallbackCode} 未到達`}
      >
        {fallbackCode}
      </div>
    );
  }
  const isStuck = pattern.stuck_type !== null;
  const colorClass = isStuck
    ? STUCK_COLOR
    : CELL_COLOR_BY_LEVEL[pattern.level_reached as 0 | 1 | 2 | 3 | 4];

  return (
    <button
      type="button"
      onClick={() => onSelect(pattern.pattern_id)}
      className={`flex aspect-square items-center justify-center rounded text-[9px] font-bold font-mono transition hover:opacity-80 ${colorClass}`}
      aria-label={`${pattern.pattern_code} ${pattern.pattern_title}`}
    >
      {pattern.pattern_code.split('-')[1] ?? pattern.pattern_code}
    </button>
  );
}

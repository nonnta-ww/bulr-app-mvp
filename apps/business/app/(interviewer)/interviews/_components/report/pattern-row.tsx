/**
 * 観察タブの 1 行（パターン）を表示。
 * 「深掘り到達」側: 5 次元ミニドット
 * 「詰まり・未到達」側: stuck_type 日本語ラベル
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import { scoreLevel03, scoreLevelScope, BAR_COLOR_CLASS } from '@/lib/heatmap-benchmarks';
import { STUCK_TYPE_LABEL } from '@/lib/stuck-type-label';

type Pattern = HeatmapData['patterns'][number];

interface Props {
  pattern: Pattern;
  variant: 'reached' | 'stuck';
  onSelect: (patternId: string) => void;
}

export function PatternRow({ pattern, variant, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(pattern.pattern_id)}
      className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-2 rounded-lg border border-hairline bg-card px-2 py-1.5 text-left text-xs transition hover:border-copper/40 hover:bg-copper-soft/40"
    >
      <span
        className={`rounded px-1 py-0.5 text-center font-mono text-[10px] font-bold text-white ${
          variant === 'reached' ? 'bg-navy' : 'bg-slate-400'
        }`}
      >
        {pattern.pattern_code}
      </span>
      <span className="truncate text-body">{pattern.pattern_title}</span>
      {variant === 'reached' ? (
        <MiniDots pattern={pattern} />
      ) : (
        <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">
          {pattern.stuck_type ? STUCK_TYPE_LABEL[pattern.stuck_type] : '—'}
        </span>
      )}
    </button>
  );
}

function MiniDots({ pattern }: { pattern: Pattern }) {
  const s = pattern.scores;
  const items = [
    scoreLevel03(s.authenticity),
    scoreLevel03(s.judgment),
    scoreLevelScope(s.scope),
    scoreLevel03(s.meta_cognition),
    scoreLevel03(s.ai_literacy),
  ];
  return (
    <span className="flex gap-1">
      {items.map((lv, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${BAR_COLOR_CLASS[lv]}`} />
      ))}
    </span>
  );
}

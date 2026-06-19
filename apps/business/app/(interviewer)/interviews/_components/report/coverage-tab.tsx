/**
 * カバレッジタブ（C: 6 カテゴリ × パターングリッド）
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §6
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import type { AssessmentPattern } from '@bulr/db/schema';
import { CATEGORY_LABEL } from '@/lib/heatmap-benchmarks';
import { CoverageCell } from './coverage-cell';

const CATEGORIES: Array<keyof typeof CATEGORY_LABEL> = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

interface Props {
  patterns: HeatmapData['patterns'];
  allPatterns: AssessmentPattern[]; // 未到達セルを描画するために全パターンが必要
  onSelectPattern: (patternId: string) => void;
}

export function CoverageTab({ patterns, allPatterns, onSelectPattern }: Props) {
  // pattern_id → カバレッジ済みパターン
  const coveredById = new Map(patterns.map((p) => [p.pattern_id, p]));

  return (
    <div className="space-y-3">
      {CATEGORIES.map((cat) => {
        const allInCat = allPatterns
          .filter((p) => p.category === cat)
          .sort((a, b) => a.code.localeCompare(b.code));

        const reachedCount = allInCat.filter((p) => {
          const cov = coveredById.get(p.id);
          return cov && cov.stuck_type === null && cov.level_reached >= 2;
        }).length;
        const stuckCount = allInCat.filter((p) => {
          const cov = coveredById.get(p.id);
          return cov && cov.stuck_type !== null;
        }).length;

        return (
          <div key={cat}>
            <div className="mb-1 grid grid-cols-[120px_1fr_auto] items-center gap-2 text-xs">
              <span className="font-bold text-ink">{CATEGORY_LABEL[cat]}</span>
              <div className="h-1 overflow-hidden rounded bg-canvas">
                <div
                  className="h-full bg-gradient-to-r from-copper to-[#e2c596]"
                  style={{ width: allInCat.length ? `${(reachedCount / allInCat.length) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-muted">
                {reachedCount}/{allInCat.length} 到達
                {stuckCount > 0 ? ` + ${stuckCount} 詰まり` : ''}
              </span>
            </div>
            <div className="grid grid-cols-12 gap-1">
              {allInCat.map((p) => (
                <CoverageCell
                  key={p.id}
                  pattern={coveredById.get(p.id) ?? null}
                  fallbackCode={p.code.split('-')[1] ?? p.code}
                  onSelect={onSelectPattern}
                />
              ))}
            </div>
          </div>
        );
      })}

      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { color: 'bg-canvas border border-hairline', label: '未到達' },
    { color: 'bg-slate-400', label: '詰まり' },
    { color: 'bg-[#f0e3cf]', label: 'L1' },
    { color: 'bg-[#e2c596]', label: 'L2' },
    { color: 'bg-[#d09a55]', label: 'L3' },
    { color: 'bg-[#a8702f]', label: 'L4' },
  ];
  return (
    <div className="flex justify-center gap-3 border-t border-hairline pt-2 text-[10px] text-muted">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded ${it.color}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

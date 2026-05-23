/**
 * 評価ヒートマップ スティッキー判定サマリー (RSC)
 * 設計: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §4
 */

import type { HeatmapData } from '@bulr/types/evaluation';
import {
  BENCHMARKS,
  scoreLevel03,
  scoreLevelScope,
  BAR_COLOR_CLASS,
  DIMENSION_LABEL,
} from '@/lib/heatmap-benchmarks';

interface Props {
  heatmapData: HeatmapData;
}

export function VerdictSummary({ heatmapData }: Props) {
  const { overall, free_question_count } = heatmapData;
  const totalPatterns = heatmapData.patterns.length;

  const dimensions = [
    { key: 'authenticity', value: overall.avg_authenticity, max: 3 },
    { key: 'judgment', value: overall.avg_judgment, max: 3 },
    { key: 'scope', value: overall.avg_scope, max: 5 },
    { key: 'meta_cognition', value: overall.avg_meta_cognition, max: 3 },
    { key: 'ai_literacy', value: overall.avg_ai_literacy, max: 3 },
  ] as const;

  return (
    <div
      data-report-sticky
      className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80"
    >
      <h3 className="mb-2 text-sm font-bold text-gray-900">
        {overall.reached_count} パターン到達 / {totalPatterns - overall.reached_count} パターン詰まり・未到達
      </h3>

      <div className="grid grid-cols-[1fr_180px] gap-4">
        {/* 5次元バー */}
        <div className="flex flex-col gap-1">
          {dimensions.map((d) => {
            const benchmark = BENCHMARKS[d.key];
            const fillPct = Math.min(Math.max(d.value / d.max, 0), 1) * 100;
            const benchPct = Math.min(Math.max(benchmark / d.max, 0), 1) * 100;
            const level = d.key === 'scope' ? scoreLevelScope(d.value) : scoreLevel03(d.value);
            return (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-right text-gray-500">{DIMENSION_LABEL[d.key]}</span>
                <div className="relative h-2 flex-1 overflow-visible rounded bg-gray-100">
                  <div
                    className={`h-full rounded ${BAR_COLOR_CLASS[level]}`}
                    style={{ width: `${fillPct.toFixed(1)}%` }}
                  />
                  <div
                    className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-gray-500"
                    style={{ left: `${benchPct.toFixed(1)}%` }}
                    aria-label={`benchmark ${benchmark}`}
                  />
                </div>
                <span className="w-8 text-right font-semibold tabular-nums text-gray-700">
                  {d.value.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        {/* 警告サイド */}
        <div className="border-l border-gray-100 pl-3 text-xs">
          <SideRow num={overall.stuck_count} label="件 詰まり" alert={overall.stuck_count > 0} />
          <SideRow num={overall.not_experienced_count} label="件 経験なし" />
          <SideRow num={overall.undeveloped_count} label="件 未深掘り" />
          <SideRow num={free_question_count} label="件 フリー質問" />
          <p className="mt-1 border-t border-gray-100 pt-1 text-[10px] text-gray-400">
            縦線 = ベンチマーク
            <br />
            0–3 軸: 2.0 / 射程: 3.0 / AI: 1.5
          </p>
        </div>
      </div>
    </div>
  );
}

function SideRow({ num, label, alert = false }: { num: number; label: string; alert?: boolean }) {
  return (
    <div className="my-0.5 flex items-baseline gap-1">
      <span
        className={`w-4 text-right font-bold tabular-nums ${alert ? 'text-red-600' : 'text-gray-700'}`}
      >
        {num}
      </span>
      <span className="text-gray-500">{label}</span>
    </div>
  );
}

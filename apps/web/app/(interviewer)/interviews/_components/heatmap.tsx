/**
 * Heatmap Server Component
 *
 * 面接評価のヒートマップを表示するサーバーコンポーネント。
 * 6カテゴリ × 5次元 = 30本の横棒グラフ、スコープ分布、AIリテラシー分布、
 * フリー質問数を純粋な Tailwind CSS + HTML で描画する。
 *
 * Requirements: 11.11
 */

import type { HeatmapData, PatternCategory } from '@bulr/types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<PatternCategory, string> = {
  design: 'システム設計',
  trouble: 'トラブル対応',
  performance: 'パフォーマンス',
  security: 'セキュリティ',
  organization: '組織・マネジメント',
  ai: 'AI活用',
};

const CATEGORIES: PatternCategory[] = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

type DimensionKey =
  | 'avg_authenticity'
  | 'avg_judgment'
  | 'avg_scope'
  | 'avg_meta_cognition'
  | 'avg_ai_literacy';

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  avg_authenticity: '真正性',
  avg_judgment: '判断力',
  avg_scope: 'スコープ',
  avg_meta_cognition: 'メタ認知',
  avg_ai_literacy: 'AIリテラシー',
};

const DIMENSIONS: DimensionKey[] = [
  'avg_authenticity',
  'avg_judgment',
  'avg_scope',
  'avg_meta_cognition',
  'avg_ai_literacy',
];

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 0-3 軸の値をパーセンテージ幅に変換する */
function pct03(value: number): string {
  const pct = Math.min(Math.max(value / 3, 0), 1) * 100;
  return `${pct.toFixed(1)}%`;
}

/** 1-5 軸（scope）の値をパーセンテージ幅に変換する */
function pct15(value: number): string {
  const pct = Math.min(Math.max((value - 1) / 4, 0), 1) * 100;
  return `${pct.toFixed(1)}%`;
}

/** 分布データの最大値を返す（0除算防止） */
function maxOf(record: Record<number, number>): number {
  const values = Object.values(record);
  return Math.max(...values, 1);
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

interface BarProps {
  label: string;
  value: number;
  widthPct: string;
  displayValue: string;
  colorClass: string;
}

function Bar({ label, value, widthPct, displayValue, colorClass }: BarProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-24 shrink-0 text-right text-xs text-gray-500">
        {label}
      </span>
      <div className="relative h-4 flex-1 rounded bg-gray-100">
        <div
          className={`h-full rounded ${colorClass} transition-all`}
          style={{ width: widthPct }}
        />
      </div>
      <span className="w-10 shrink-0 text-left text-xs tabular-nums text-gray-700">
        {displayValue}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

interface HeatmapProps {
  heatmapData: HeatmapData;
}

export function Heatmap({ heatmapData }: HeatmapProps) {
  const { by_category, scope_distribution, ai_literacy_distribution, free_question_count } =
    heatmapData;

  const scopeMax = maxOf(scope_distribution);
  const aiMax = maxOf(ai_literacy_distribution);

  return (
    <div className="space-y-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">評価ヒートマップ</h2>
        <span className="text-sm text-gray-500">
          フリー質問数：
          <span className="ml-1 font-mono font-semibold text-gray-800">
            {free_question_count}
          </span>
        </span>
      </div>

      {/* カテゴリ × 次元 */}
      <section className="space-y-6">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          カテゴリ別評価
        </h3>
        {CATEGORIES.map((cat) => {
          const data = by_category[cat];
          const isEmpty = data.pattern_count === 0;

          return (
            <div key={cat} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-gray-700">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-xs text-gray-400">
                  {isEmpty ? '評価なし' : `n=${data.pattern_count}`}
                </span>
              </div>

              {isEmpty ? (
                <p className="pl-28 text-xs italic text-gray-300">評価なし</p>
              ) : (
                <div className="space-y-0.5">
                  {DIMENSIONS.map((dim) => {
                    const raw = data[dim];
                    const isScope = dim === 'avg_scope';
                    const widthPct = isScope ? pct15(raw) : pct03(raw);
                    const displayValue = isScope
                      ? raw.toFixed(1)
                      : raw.toFixed(2);

                    // 次元ごとに色を変える
                    const colorMap: Record<DimensionKey, string> = {
                      avg_authenticity: 'bg-blue-400',
                      avg_judgment: 'bg-violet-400',
                      avg_scope: 'bg-emerald-400',
                      avg_meta_cognition: 'bg-amber-400',
                      avg_ai_literacy: 'bg-rose-400',
                    };

                    return (
                      <Bar
                        key={dim}
                        label={DIMENSION_LABELS[dim]}
                        value={raw}
                        widthPct={widthPct}
                        displayValue={displayValue}
                        colorClass={colorMap[dim]}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* スコープ分布 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          スコープ分布（1–5）
        </h3>
        {([1, 2, 3, 4, 5] as const).map((level) => {
          const count = scope_distribution[level];
          const widthPct = `${((count / scopeMax) * 100).toFixed(1)}%`;
          return (
            <Bar
              key={level}
              label={`Lv ${level}`}
              value={count}
              widthPct={widthPct}
              displayValue={String(count)}
              colorClass="bg-emerald-400"
            />
          );
        })}
      </section>

      {/* AIリテラシー分布 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          AIリテラシー分布（0–3）
        </h3>
        {([0, 1, 2, 3] as const).map((level) => {
          const count = ai_literacy_distribution[level];
          const widthPct = `${((count / aiMax) * 100).toFixed(1)}%`;
          return (
            <Bar
              key={level}
              label={`Lv ${level}`}
              value={count}
              widthPct={widthPct}
              displayValue={String(count)}
              colorClass="bg-rose-400"
            />
          );
        })}
      </section>
    </div>
  );
}

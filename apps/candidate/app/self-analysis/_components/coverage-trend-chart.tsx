'use client';

/**
 * coverage-trend-chart.tsx — 成長推移グラフ（Client Component）
 *
 * CoverageTrend を受け取り、全体網羅度の折れ線を既定表示し、
 * カテゴリ別折れ線を凡例クリックでトグル表示する recharts グラフ。
 *
 * - 全体網羅度（overall）は常に表示。
 * - カテゴリ別折れ線はデフォルト非表示。凡例クリックで個別トグル。
 * - 数値序列・他者比較・偏差値は一切表示しない（Req 4.5）。
 * - viz_only 版（llmOutput === null）も通常データ点として表示（Req 4.3）。
 * - このコンポーネント自体は 'use client' で SSR 対象外。
 *   コンシューマー（history-section）は dynamic(ssr:false) でインポートすること。
 *
 * Boundary: coverage-trend-chart
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LegendPayload } from 'recharts';

import type { CoverageTrend } from '../_lib/trend';

// ---------------------------------------------------------------------------
// カテゴリ線の色パレット（アクセシブルな明確な色を優先）
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: string[] = [
  '#2563eb', // blue-600
  '#16a34a', // green-600
  '#9333ea', // purple-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
  '#ca8a04', // yellow-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#dc2626', // red-600
];

// overall 線の色（目立つ、太め）
const OVERALL_COLOR = '#0f172a'; // slate-900

// ---------------------------------------------------------------------------
// 行データ型（recharts に渡すオブジェクトの形状）
// ---------------------------------------------------------------------------
interface ChartRow {
  versionLabel: string;
  overall: number;
  [categoryName: string]: number | string;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** Date を "YYYY/MM/DD" 形式の文字列に変換する */
function formatDate(date: Date): string {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

/** 網羅度（0..1）を 0〜100 の整数パーセントに変換 */
function toPercent(value: number): number {
  return Math.round(value * 100);
}

/** CoverageTrend → recharts 用行配列に変換 */
function buildChartRows(trend: CoverageTrend): ChartRow[] {
  // overall の versionIndex を x 軸基準とする（昇順）
  return trend.overall.map((point) => {
    const row: ChartRow = {
      versionLabel: formatDate(point.submittedAt),
      overall: toPercent(point.value),
    };

    // 各カテゴリについて、この versionIndex に対応する点があれば追加
    for (const category of trend.byCategory) {
      const catPoint = category.points.find(
        (p) => p.versionIndex === point.versionIndex,
      );
      if (catPoint !== undefined) {
        row[category.categoryName] = toPercent(catPoint.value);
      }
      // 点がない場合はキーを追加しない（gap 表示 / 0 埋め禁止）
    }

    return row;
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CoverageTrendChartProps {
  trend: CoverageTrend;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * 成長推移グラフ
 *
 * - overall 折れ線は常時表示
 * - カテゴリ折れ線はデフォルト非表示。凡例のカテゴリ名をクリックでトグル
 */
export function CoverageTrendChart({ trend }: CoverageTrendChartProps) {
  const rows = buildChartRows(trend);
  const categoryNames = trend.byCategory.map((c) => c.categoryName);

  // カテゴリ別折れ線の表示状態：Set に含まれるカテゴリは「表示」
  // デフォルトは全カテゴリ非表示（overall のみ表示）
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    () => new Set<string>(),
  );

  /** 凡例クリック時のトグルハンドラ */
  function handleLegendClick(payload: LegendPayload): void {
    const key = payload.dataKey as string | undefined;
    if (!key || key === 'overall') return; // overall は常時表示のためトグル不可

    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        カテゴリ名をクリックすると折れ線の表示/非表示を切り替えられます
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="versionLabel"
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value) =>
              value !== undefined ? [`${value}%`] : ['-']
            }
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend
            onClick={handleLegendClick}
            wrapperStyle={{ cursor: 'pointer', fontSize: 12 }}
          />

          {/* 全体網羅度（常時表示） */}
          <Line
            type="monotone"
            dataKey="overall"
            name="全体"
            stroke={OVERALL_COLOR}
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            hide={false}
          />

          {/* カテゴリ別（デフォルト非表示、凡例クリックでトグル） */}
          {categoryNames.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              hide={!visibleCategories.has(name)}
              strokeDasharray="4 2"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

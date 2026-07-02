'use client';

/**
 * skill-balance-radar.tsx — カテゴリ別熟練度レーダー（Client Component）
 *
 * AggregatedSnapshot のカテゴリ別 proficiencyScore（0..100）を recharts のレーダーで
 * 俯瞰表示する。カバレッジ表示（coverage-bars）とは独立した熟練度の可視化。
 *
 * - proficiencyScore が欠損（null）のカテゴリは 0 ではなく除外して描画する（Req 6.3）。
 * - 表示に足るデータが無い（0カテゴリ or 全件欠損）場合はデータ不足の空表示にする（Req 6.3）。
 * - 数値序列・他者比較は行わない（自己のスコアのみ）。
 * - このコンポーネントは 'use client' で SSR 対象外。
 *   コンシューマー（task 5.2 の self-analysis-view）は dynamic(ssr:false) でインポートすること。
 *
 * Boundary: SkillBalanceRadar
 * Requirements: 6.1, 6.3
 */

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { selectRadarPoints } from '../_lib/skill-balance';

const RADAR_COLOR = '#f28705'; // Zenith primary（オレンジ）

interface SkillBalanceRadarProps {
  categories: Array<{ categoryName: string; proficiencyScore?: number | null }>;
}

/**
 * カテゴリ別熟練度レーダー。
 * 有効スコアが1件も無ければ空表示、1件以上あればレーダーを描画する。
 */
export function SkillBalanceRadar({ categories }: SkillBalanceRadarProps) {
  const points = selectRadarPoints(categories);

  if (points.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-card border border-dashed border-hairline bg-canvas">
        <p className="px-6 text-center text-sm text-muted">
          熟練度を表示できるデータがまだありません。
          <br />
          能力設問に回答すると、カテゴリ別の熟練度バランスが表示されます。
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        カテゴリ別の熟練度（0〜100）です。あなた自身の回答に基づく相対的な強弱で、他者との比較ではありません。
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={points} margin={{ top: 16, right: 24, bottom: 16, left: 24 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="categoryName" tick={{ fontSize: 12, fill: '#374151' }} />
          <PolarRadiusAxis
            domain={[0, 100]}
            tickCount={5}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
          />
          <Radar
            name="熟練度"
            dataKey="proficiencyScore"
            stroke={RADAR_COLOR}
            fill={RADAR_COLOR}
            fillOpacity={0.3}
            isAnimationActive={false}
          />
          <Tooltip
            formatter={(value) => [`${value}`, '熟練度']}
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

'use client';

/**
 * vocation-radar.tsx — 7職掌レーダー（Client Component, task 8.2 / R4.2/4.4）
 *
 * ClassResult の 7職掌ベクトル（0..100）を recharts のレーダーで俯瞰表示する。
 * skill-balance-radar のパターンに倣うが、数値スコアは一切露出しない（R4.4）:
 *  - PolarRadiusAxis の目盛りラベル（数値）を空関数で消す。
 *  - <Tooltip> は職掌ラベルのみを見せ、数値を出さないよう formatter で空文字化する。
 * 形状（レーダーの広がり）でバランスを伝え、スコアは見せない。
 *
 * 気質2軸（temperamentAxes）は任意で受け取り、数値なしのラベル注記として下部に添える。
 *
 * このコンポーネントは 'use client' で SSR 対象外。
 * コンシューマー（diagnosis view）は dynamic(ssr:false) でインポートすること。
 *
 * Boundary: VocationRadar
 * Requirements: 4.2, 4.4
 */

import type { VocationVector } from '@bulr/types';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { VOCATIONS, VOCATION_LABELS } from '../_lib/definitions';

const RADAR_COLOR = '#f28705'; // Zenith primary（オレンジ）

interface VocationRadarProps {
  vocationVector: VocationVector;
  /** 気質2軸（0..100）。null/未指定なら注記を出さない。数値は表示しない（R4.4）。 */
  temperamentAxes?: {
    explorationDeepening: number;
    soloCollaboration: number;
  } | null;
}

/**
 * 7職掌レーダー。VOCATIONS の決定論的順序で軸を並べ、ラベルは VOCATION_LABELS を用いる。
 * 数値（目盛り・ツールチップ値）は一切表示しない（R4.4）。
 */
export function VocationRadar({ vocationVector, temperamentAxes }: VocationRadarProps) {
  const points = VOCATIONS.map((vocation) => ({
    vocationLabel: VOCATION_LABELS[vocation],
    // レーダー形状を描くための内部値。UI 上には数値として露出しない（R4.4）。
    score: vocationVector[vocation],
  }));

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        7つの職掌のバランスです。数値ではなく、広がり（かたち）で強みの分布を表します。
      </p>
      {/*
       * アクセシブルな職掌ラベル一覧（数値なし, R4.4）。
       * レーダーの軸ラベルは SVG 内に描画されるが、支援技術・および描画環境に依存せず
       * 職掌名を伝えるため、スクリーンリーダー向けにテキストとしても提示する（R4.2）。
       */}
      <ul className="sr-only" data-testid="vocation-radar-labels">
        {points.map((p) => (
          <li key={p.vocationLabel}>{p.vocationLabel}</li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={points} margin={{ top: 16, right: 24, bottom: 16, left: 24 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="vocationLabel" tick={{ fontSize: 12, fill: '#374151' }} />
          {/* 目盛りの数値ラベルは表示しない（R4.4）。 */}
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={false}
            axisLine={false}
            tickFormatter={() => ''}
          />
          <Radar
            name="職掌バランス"
            dataKey="score"
            stroke={RADAR_COLOR}
            fill={RADAR_COLOR}
            fillOpacity={0.3}
            isAnimationActive={false}
          />
          {/* ツールチップは職掌ラベルのみ。数値は出さない（R4.4）。 */}
          <Tooltip
            formatter={(_value, _name, item) => [
              '',
              (item?.payload as { vocationLabel?: string } | undefined)?.vocationLabel ?? '',
            ]}
            separator=""
            labelFormatter={() => ''}
            contentStyle={{ fontSize: 12 }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* 気質2軸の注記（数値なし, R4.4） */}
      {temperamentAxes ? (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>探索 ⇔ 深化</span>
          <span>個人 ⇔ 協調</span>
        </div>
      ) : null}
    </div>
  );
}

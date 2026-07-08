/**
 * axis-bars.tsx — 気質4軸のバイポーラ可視化（task 4.1 / R2.2, R2.3）
 *
 * 各軸を「第1極 ⇔ 第2極」のトラックとして描き、AxisReading.score の寄りをトラック上の
 * マーカー位置（0..100 → 0%..100%）だけで示す。**数値ラベルは一切描画しない**（position-only,
 * R2.3）。未回答（determined=false）の軸は淡色トラック＋「未回答」表示にし、確信的なマーカーは
 * 置かず中立状態として区別する（R2.2）。
 *
 * presentational / summary-only。フック不使用のため 'use client' は付けない。
 * バー表示順は AXES canonical order（決定論）。
 *
 * Zenith デザイントークン（rounded-card / border-hairline / bg-card / text-muted）を用い、
 * テーマトークン非依存の配色は明示 Tailwind クラスで指定する（candidate の運用方針）。
 *
 * Boundary: AxisBars
 * Requirements: 2.2, 2.3
 */

import type { TemperamentAxis } from '@bulr/types';

import { AXES, AXIS_LABELS } from '../../_lib/temperament/axes';
import type { AxisReading } from '../../_lib/temperament/score';

interface AxisBarsProps {
  /** profile の axes マップ（常に4軸キー完備）。 */
  axes: Record<TemperamentAxis, AxisReading>;
}

/** score(0..100) を CSS left パーセント（0..100%）へ clamp して変換する。 */
function markerLeft(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  return `${clamped}%`;
}

/**
 * 4軸のバイポーラトラックを AXES 順で描画する presentational コンポーネント。
 * score はマーカー位置にのみ使用し、数値としては一切描画しない（R2.3）。
 */
export function AxisBars({ axes }: AxisBarsProps) {
  return (
    <div className="flex flex-col gap-5" data-testid="axis-bars">
      {AXES.map((axis) => {
        const reading = axes[axis];
        const label = AXIS_LABELS[axis];
        const { determined, score } = reading;

        return (
          <div
            key={axis}
            className="rounded-card border border-hairline bg-card p-4"
            data-testid={`axis-bar-${axis}`}
          >
            <div className="flex items-center justify-between text-sm font-medium">
              <span
                className={determined ? 'text-gray-900' : 'text-gray-400'}
              >
                {label.first}
              </span>
              <span
                className={determined ? 'text-gray-900' : 'text-gray-400'}
              >
                {label.second}
              </span>
            </div>

            {/* バイポーラトラック。マーカーは left% のみで寄りを示す（数値非表示）。 */}
            <div
              className={`relative mt-2 h-2 rounded-full ${
                determined ? 'bg-orange-100' : 'bg-gray-100'
              }`}
              aria-hidden="true"
            >
              {/* 中点の目盛り */}
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300" />

              {determined ? (
                <span
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-600 shadow"
                  style={{ left: markerLeft(score) }}
                  data-testid={`axis-bar-${axis}-marker`}
                />
              ) : (
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-gray-400 bg-transparent"
                  style={{ left: '50%' }}
                />
              )}
            </div>

            {!determined ? (
              <p
                className="mt-2 text-xs text-muted"
                data-testid={`axis-bar-${axis}-unanswered`}
              >
                未回答
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

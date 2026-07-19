/**
 * growth-advice-section.tsx — 成長ディメンションのアドバイス提示（task 5.3 / R5.3, R5.4）
 *
 * `GrowthAdvice[]`（回答済みディメンションのみ）を、本人向けの「伸びしろ」文脈で提示する。
 * 数値スコア・順位・他者比較は描画しない（R5.3/R5.4）。回答が無い場合は親が本コンポーネントを
 * マウントしない想定だが、空配列でも安全に何も描画しない。
 *
 * presentational / summary-only。
 *
 * Boundary: growth-advice-section
 * Requirements: 5.3, 5.4
 */

import type { GrowthAdvice } from '../../_lib/teamwork-style/growth';

interface GrowthAdviceSectionProps {
  advice: GrowthAdvice[];
}

/** 成長アドバイスを伸びしろ文脈で提示する presentational コンポーネント。 */
export function GrowthAdviceSection({ advice }: GrowthAdviceSectionProps) {
  if (advice.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-card border border-hairline bg-card p-6"
      data-testid="teamwork-style-growth"
    >
      <p className="text-sm font-medium text-orange-700">成長のヒント（伸びしろ）</p>
      <p className="mt-1 text-sm text-muted">
        対人・協働の面で、これから伸ばすと効く観点です。優劣ではなく、あなた自身の伸びしろとして受け取ってください。
      </p>

      <ul className="mt-4 flex flex-col gap-4">
        {advice.map((item) => (
          <li
            key={item.dimension}
            className="rounded-card bg-orange-50 p-4"
            data-testid={`growth-advice-${item.dimension}`}
          >
            <p className="text-sm font-semibold text-gray-900">{item.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-800">
              {item.advice}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

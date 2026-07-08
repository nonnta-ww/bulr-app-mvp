// @vitest-environment jsdom
/**
 * axis-bars.test.tsx — AxisBars UI テスト（task 4.1 / R2.2, R2.3）
 *
 * 検証:
 *  - 4軸のバイポーラトラックが AXES canonical order で描画される（R2.2）。
 *  - 各軸の第1極/第2極ラベルが提示される。
 *  - 数値スコアが一切表示されない（position-only marker, R2.3）。
 *  - partial profile: 未回答（determined=false）軸は「未回答」affordance を持ち、
 *    回答済み軸は持たない（R2.2/R2.3）。
 *
 * 実データ（scoreThinkingStyle の AxisReading 形）を用いて検証する。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { AXES, AXIS_LABELS } from '../../_lib/thinking-style/axes';
import {
  scoreThinkingStyle,
  type ThinkingStyleAnswer,
} from '../../_lib/thinking-style/score';
import { AxisBars } from './axis-bars';

afterEach(cleanup);

/** level=maxLevel（=100% 寄り＝第2極 high）の回答を1問作る。 */
function high(axis: (typeof AXES)[number]): ThinkingStyleAnswer {
  return { axis, level: 4, reverse: false, maxLevel: 4 };
}

/** level=0（=0% 寄り＝第1極 low）の回答を1問作る。 */
function low(axis: (typeof AXES)[number]): ThinkingStyleAnswer {
  return { axis, level: 0, reverse: false, maxLevel: 4 };
}

describe('AxisBars', () => {
  it('4軸すべて回答時: 4トラック描画・極ラベル提示・数値非表示 (R2.2, R2.3)', () => {
    const profile = scoreThinkingStyle([
      high('abstractConcrete'),
      low('logicIntuition'),
      high('convergentDivergent'),
      low('theoryPractice'),
    ]);

    render(<AxisBars axes={profile.axes} />);

    // 4トラック描画
    for (const axis of AXES) {
      expect(screen.getByTestId(`axis-bar-${axis}`)).toBeInTheDocument();
      // 各軸の第1極/第2極ラベル
      const bar = within(screen.getByTestId(`axis-bar-${axis}`));
      expect(bar.getByText(AXIS_LABELS[axis].first)).toBeInTheDocument();
      expect(bar.getByText(AXIS_LABELS[axis].second)).toBeInTheDocument();
    }

    // 数値スコアが一切テキストとして現れない（R2.3）。
    // score は 0 / 100 いずれか（high=100, low=0）。生の数値文字列は描画されてはならない。
    for (const axis of AXES) {
      const barText =
        screen.getByTestId(`axis-bar-${axis}`).textContent ?? '';
      const rawScore = String(profile.axes[axis].score);
      expect(barText).not.toContain(rawScore);
      expect(barText).not.toContain('%');
    }
  });

  it('partial profile: 未回答軸のみ「未回答」affordance を持つ (R2.2)', () => {
    // 2軸のみ回答 → 残り2軸は determined=false。
    const profile = scoreThinkingStyle([
      high('abstractConcrete'),
      low('logicIntuition'),
    ]);

    render(<AxisBars axes={profile.axes} />);

    for (const axis of AXES) {
      const determined = profile.axes[axis].determined;
      const unanswered = screen.queryByTestId(`axis-bar-${axis}-unanswered`);
      if (determined) {
        expect(unanswered).toBeNull();
      } else {
        expect(unanswered).toBeInTheDocument();
        expect(unanswered).toHaveTextContent('未回答');
      }
    }
  });

  it('4トラックが AXES canonical order で並ぶ', () => {
    const profile = scoreThinkingStyle([
      high('abstractConcrete'),
      high('logicIntuition'),
      high('convergentDivergent'),
      high('theoryPractice'),
    ]);

    const { container } = render(<AxisBars axes={profile.axes} />);

    const bars = Array.from(
      container.querySelectorAll('[data-testid^="axis-bar-"]'),
    ).filter((el) =>
      AXES.some((axis) => el.getAttribute('data-testid') === `axis-bar-${axis}`),
    );

    const renderedOrder = bars.map((el) =>
      el.getAttribute('data-testid')?.replace('axis-bar-', ''),
    );
    expect(renderedOrder).toEqual([...AXES]);
  });
});

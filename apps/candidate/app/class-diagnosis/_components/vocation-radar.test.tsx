// @vitest-environment jsdom
/**
 * VocationRadar UI テスト（task 8.2 / Req 4.2, 4.4）
 *
 * 検証:
 *  - 7職掌のラベルが現れる（R4.2）。
 *  - 数値スコア（識別可能な値）が一切表示されない（R4.4）。
 *
 * NOTE: recharts の PolarAngleAxis ラベルは jsdom（0幅 ResponsiveContainer）では描画
 * されないため、コンポーネントが併記するアクセシブルな職掌ラベル一覧
 * （data-testid="vocation-radar-labels"）で軸ラベルの提示を検証する。
 */

import type { VocationVector } from '@bulr/types';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { VocationRadar } from './vocation-radar';

afterEach(cleanup);

const DISTINCTIVE_SCORE = 87.5;

const VECTOR: VocationVector = {
  vanguard: DISTINCTIVE_SCORE,
  rearguard: 42,
  guardian: 30,
  sage: 25,
  commander: 20,
  strategist: 15,
  ranger: 10,
};

describe('VocationRadar', () => {
  it('7職掌のラベルを提示する (R4.2)', () => {
    render(<VocationRadar vocationVector={VECTOR} />);

    const labels = within(screen.getByTestId('vocation-radar-labels'));
    for (const label of ['前衛', '後衛', '守護', '賢者', '指揮', '策士', '遊撃']) {
      expect(labels.getByText(label)).toBeInTheDocument();
    }
  });

  it('数値スコアを一切表示しない (R4.4)', () => {
    const { container } = render(<VocationRadar vocationVector={VECTOR} />);
    expect(container.textContent).not.toContain(String(DISTINCTIVE_SCORE));
    expect(container.textContent).not.toContain('42');
  });

  it('気質2軸（任意）を数値なしで受け取っても破綻しない (R4.4)', () => {
    const { container } = render(
      <VocationRadar
        vocationVector={VECTOR}
        temperamentAxes={{ explorationDeepening: 70, soloCollaboration: 30 }}
      />,
    );
    // 職掌ラベルは提示される
    expect(within(screen.getByTestId('vocation-radar-labels')).getByText('前衛')).toBeInTheDocument();
    // 気質軸の数値は漏れない
    expect(container.textContent).not.toContain('70');
    expect(container.textContent).not.toContain('30');
  });
});

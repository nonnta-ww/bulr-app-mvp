// @vitest-environment jsdom
/**
 * SkillBalanceRadar UI テスト（task 6.3 / Req 6.1, 6.3, 8.2）
 *
 * 検証:
 *  - 全件欠損（null/旧版で未保持）なら空表示にフォールバックし破綻しない
 *  - 有効スコアがあればレーダー（非空）を描画する
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SkillBalanceRadar } from './skill-balance-radar';

afterEach(cleanup);

describe('SkillBalanceRadar', () => {
  it('全件欠損(null)/旧版データなら空表示で破綻しない (Req 6.3, 8.2)', () => {
    render(
      <SkillBalanceRadar
        categories={[
          { categoryName: 'A', proficiencyScore: null },
          { categoryName: 'B' }, // proficiencyScore 欠落（旧スナップショット相当）
        ]}
      />,
    );
    expect(screen.getByText(/熟練度を表示できるデータがまだありません/)).toBeInTheDocument();
  });

  it('有効スコアがあればレーダーを描画する（空表示にならない） (Req 6.1)', () => {
    render(
      <SkillBalanceRadar
        categories={[
          { categoryName: 'A', proficiencyScore: 80 },
          { categoryName: 'B', proficiencyScore: 40 },
          { categoryName: 'C', proficiencyScore: 60 },
        ]}
      />,
    );
    expect(screen.getByText(/カテゴリ別の熟練度/)).toBeInTheDocument();
    expect(screen.queryByText(/熟練度を表示できるデータがまだありません/)).not.toBeInTheDocument();
  });
});

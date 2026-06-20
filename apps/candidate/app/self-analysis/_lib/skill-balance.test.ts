import { describe, it, expect } from 'vitest';
import { selectRadarPoints, isRadarEmpty } from './skill-balance';

describe('skill-balance — selectRadarPoints (Req 6.1, 6.3)', () => {
  it('proficiencyScore が null のカテゴリは欠損として除外する（0 ではない）', () => {
    const points = selectRadarPoints([
      { categoryName: 'A', proficiencyScore: 80 },
      { categoryName: 'B', proficiencyScore: null },
      { categoryName: 'C', proficiencyScore: 0 },
    ]);
    // null の B は除外。score=0 の C は有効値として保持する。
    expect(points).toEqual([
      { categoryName: 'A', proficiencyScore: 80 },
      { categoryName: 'C', proficiencyScore: 0 },
    ]);
  });

  it('入力順を保持する', () => {
    const points = selectRadarPoints([
      { categoryName: 'X', proficiencyScore: 33 },
      { categoryName: 'Y', proficiencyScore: 67 },
    ]);
    expect(points.map((p) => p.categoryName)).toEqual(['X', 'Y']);
  });

  it('全件 null なら空配列', () => {
    expect(
      selectRadarPoints([
        { categoryName: 'A', proficiencyScore: null },
        { categoryName: 'B', proficiencyScore: null },
      ]),
    ).toEqual([]);
  });

  it('proficiencyScore が undefined（旧スナップショットで欠落）でも除外する', () => {
    const points = selectRadarPoints([
      { categoryName: 'A', proficiencyScore: 50 },
      { categoryName: 'B' } as { categoryName: string; proficiencyScore?: number | null },
    ]);
    expect(points).toEqual([{ categoryName: 'A', proficiencyScore: 50 }]);
  });
});

describe('skill-balance — isRadarEmpty (Req 6.3)', () => {
  it('カテゴリ0件なら空', () => {
    expect(isRadarEmpty([])).toBe(true);
  });

  it('全件欠損(null)なら空', () => {
    expect(isRadarEmpty([{ categoryName: 'A', proficiencyScore: null }])).toBe(true);
  });

  it('1件以上の有効スコアがあれば空ではない', () => {
    expect(isRadarEmpty([{ categoryName: 'A', proficiencyScore: 0 }])).toBe(false);
    expect(
      isRadarEmpty([
        { categoryName: 'A', proficiencyScore: null },
        { categoryName: 'B', proficiencyScore: 90 },
      ]),
    ).toBe(false);
  });
});

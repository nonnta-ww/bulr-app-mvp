// @vitest-environment jsdom
/**
 * RepresentativeClassSection コンポーネントのテスト
 *
 * 検証内容:
 *  - 診断済み候補者: 事前合成された className 文字列を read-only 表示する（Req 10.2）
 *  - 未診断候補者（representativeClass=null）: 何も描画しない（セクション非表示）（Req 10.1, 10.3）
 *  - 根拠回答・パーティ/編成 UI を含まない（クラス名テキストのみ）（Req 10.3, 11.3）
 *
 * Requirements: 10.1, 10.2, 10.3, 11.3
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { RepresentativeClass } from '@bulr/types';

import { RepresentativeClassSection } from './representative-class-section';

const SECTION_TESTID = 'representative-class-section';

function makeRepresentativeClass(
  overrides?: Partial<RepresentativeClass>,
): RepresentativeClass {
  return {
    className: 'スペシャリスト・孤高の深化者な前衛',
    primaryVocation: 'vanguard',
    title: 'specialist',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('RepresentativeClassSection', () => {
  it('診断済み: 事前合成された className 文字列を表示する (Req 10.2)', () => {
    const representativeClass = makeRepresentativeClass();
    render(<RepresentativeClassSection representativeClass={representativeClass} />);

    expect(screen.getByTestId(SECTION_TESTID)).toBeTruthy();
    expect(screen.getByText(representativeClass.className)).toBeTruthy();
  });

  it('未診断 (null): 何も描画しない — セクション非表示 (Req 10.1, 10.3)', () => {
    const { container } = render(
      <RepresentativeClassSection representativeClass={null} />,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId(SECTION_TESTID)).toBeNull();
  });

  it('クラス名のみを表示し、根拠回答やパーティ/編成 UI を含まない (Req 10.3, 11.3)', () => {
    const representativeClass = makeRepresentativeClass();
    render(<RepresentativeClassSection representativeClass={representativeClass} />);

    const section = screen.getByTestId(SECTION_TESTID);
    const text = section.textContent ?? '';

    // クラス名は含まれる
    expect(text).toContain(representativeClass.className);
    // 根拠回答・パーティ/編成に関する語は含まれない
    expect(text).not.toContain('回答');
    expect(text).not.toContain('パーティ');
    expect(text).not.toContain('編成');
    expect(text).not.toContain('再生成');
  });
});

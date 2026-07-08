// @vitest-environment jsdom
/**
 * PlaystyleSharePanel / toPlaystyleShareText テスト（task 4.3 / Req 4.1, 4.2, 4.3）
 *
 * 検証:
 *  - toPlaystyleShareText(archetype): アーキタイプ名（name）を含む（R4.1）。
 *  - toPlaystyleShareText(archetype): description / nextStep など PII を含めず、
 *    数字も一切含めない（R4.2 の厳格運用）。
 *  - PlaystyleSharePanel: 共有テキストのプレビューと共有/コピーボタンを描画する。
 *  - ボタン押下で navigator.clipboard.writeText が共有テキストで呼ばれ、確認表示が出る。
 *  - navigator.clipboard / navigator.share が無い環境でもクラッシュしない。
 */

import type { Archetype } from '../../_lib/temperament/archetypes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PlaystyleSharePanel, toPlaystyleShareText } from './playstyle-share-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// description / nextStep に埋め込む識別可能なマーカー（PII 相当・数字を含む）。
const DISTINCTIVE_DESCRIPTION = 'ヒミツの説明マーカー7号';
const DISTINCTIVE_NEXT_STEP = 'ヒミツの次の一歩マーカー';

function makeArchetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    name: '静かな地図職人',
    shortLabel: '地図職人',
    description: DISTINCTIVE_DESCRIPTION,
    nextStep: DISTINCTIVE_NEXT_STEP,
    ...overrides,
  };
}

describe('toPlaystyleShareText', () => {
  it('アーキタイプ名を含む (R4.1)', () => {
    const archetype = makeArchetype();
    const text = toPlaystyleShareText(archetype);

    expect(text).toContain(archetype.name);
  });

  it('description / nextStep などの PII・数字を含めない (R4.2)', () => {
    const archetype = makeArchetype();
    const text = toPlaystyleShareText(archetype);

    // 回答由来の説明文（PII 相当）は含めない。
    expect(text).not.toContain(DISTINCTIVE_DESCRIPTION);
    expect(text).not.toContain(DISTINCTIVE_NEXT_STEP);
    // 極コード等の内部識別子は含めない。
    expect(text).not.toContain('deepener-solo-planner-stabilizer');
    // 一切の数字を含めない（R4.2 の厳格運用: スコア・数値排除）。
    expect(text).not.toMatch(/\d/);
  });
});

describe('PlaystyleSharePanel', () => {
  it('共有テキストのプレビューと共有ボタンを描画する', () => {
    const archetype = makeArchetype();
    render(<PlaystyleSharePanel archetype={archetype} />);

    const preview = screen.getByTestId('playstyle-share-preview');
    for (const line of toPlaystyleShareText(archetype).split('\n')) {
      expect(preview).toHaveTextContent(line);
    }
    expect(screen.getByTestId('playstyle-share-button')).toBeInTheDocument();
  });

  it('ボタン押下で共有テキストがクリップボードにコピーされ確認が出る', async () => {
    const archetype = makeArchetype();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PlaystyleSharePanel archetype={archetype} />);

    fireEvent.click(screen.getByTestId('playstyle-share-button'));

    expect(writeText).toHaveBeenCalledWith(toPlaystyleShareText(archetype));

    expect(await screen.findByTestId('playstyle-share-copied')).toBeInTheDocument();
  });

  it('clipboard / share が無い環境でもクラッシュしない', () => {
    const archetype = makeArchetype();

    // clipboard / share を未定義にする。
    Object.assign(navigator, { clipboard: undefined, share: undefined });

    render(<PlaystyleSharePanel archetype={archetype} />);

    expect(() => {
      fireEvent.click(screen.getByTestId('playstyle-share-button'));
    }).not.toThrow();
  });
});

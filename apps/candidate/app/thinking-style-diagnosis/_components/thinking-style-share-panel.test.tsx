// @vitest-environment jsdom
/**
 * ThinkingStyleSharePanel / toThinkingStyleShareText テスト（task 4.3 / Req 4.1, 4.2, 4.3）
 *
 * 検証:
 *  - toThinkingStyleShareText(archetype): アーキタイプ名（name）を含む（R4.1）。
 *  - toThinkingStyleShareText(archetype): description / nextStep など PII を含めず、
 *    数字も一切含めない（R4.2 の厳格運用）。
 *  - ThinkingStyleSharePanel: 共有テキストのプレビューと共有/コピーボタンを描画する。
 *  - ボタン押下で navigator.clipboard.writeText が共有テキストで呼ばれ、確認表示が出る。
 *  - navigator.clipboard / navigator.share が無い環境でもクラッシュしない。
 */

import type { Archetype } from '../../_lib/thinking-style/archetypes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ThinkingStyleSharePanel, toThinkingStyleShareText } from './thinking-style-share-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// description / nextStep に埋め込む識別可能なマーカー（PII 相当・数字を含む）。
const DISTINCTIVE_DESCRIPTION = 'ヒミツの説明マーカー7号';
const DISTINCTIVE_NEXT_STEP = 'ヒミツの次の一歩マーカー';

function makeArchetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    name: '静謐な理論家',
    shortLabel: '理論家',
    description: DISTINCTIVE_DESCRIPTION,
    nextStep: DISTINCTIVE_NEXT_STEP,
    ...overrides,
  };
}

describe('toThinkingStyleShareText', () => {
  it('アーキタイプ名を含む (R4.1)', () => {
    const archetype = makeArchetype();
    const text = toThinkingStyleShareText(archetype);

    expect(text).toContain(archetype.name);
  });

  it('description / nextStep などの PII・数字を含めない (R4.2)', () => {
    const archetype = makeArchetype();
    const text = toThinkingStyleShareText(archetype);

    // 回答由来の説明文（PII 相当）は含めない。
    expect(text).not.toContain(DISTINCTIVE_DESCRIPTION);
    expect(text).not.toContain(DISTINCTIVE_NEXT_STEP);
    // 極コード等の内部識別子は含めない。
    expect(text).not.toContain('abstract-logic-convergent-theory');
    // 一切の数字を含めない（R4.2 の厳格運用: スコア・数値排除）。
    expect(text).not.toMatch(/\d/);
  });
});

describe('ThinkingStyleSharePanel', () => {
  it('共有テキストのプレビューと共有ボタンを描画する', () => {
    const archetype = makeArchetype();
    render(<ThinkingStyleSharePanel archetype={archetype} />);

    const preview = screen.getByTestId('thinking-style-share-preview');
    for (const line of toThinkingStyleShareText(archetype).split('\n')) {
      expect(preview).toHaveTextContent(line);
    }
    expect(screen.getByTestId('thinking-style-share-button')).toBeInTheDocument();
  });

  it('ボタン押下で共有テキストがクリップボードにコピーされ確認が出る', async () => {
    const archetype = makeArchetype();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ThinkingStyleSharePanel archetype={archetype} />);

    fireEvent.click(screen.getByTestId('thinking-style-share-button'));

    expect(writeText).toHaveBeenCalledWith(toThinkingStyleShareText(archetype));

    expect(await screen.findByTestId('thinking-style-share-copied')).toBeInTheDocument();
  });

  it('clipboard / share が無い環境でもクラッシュしない', () => {
    const archetype = makeArchetype();

    // clipboard / share を未定義にする。
    Object.assign(navigator, { clipboard: undefined, share: undefined });

    render(<ThinkingStyleSharePanel archetype={archetype} />);

    expect(() => {
      fireEvent.click(screen.getByTestId('thinking-style-share-button'));
    }).not.toThrow();
  });
});

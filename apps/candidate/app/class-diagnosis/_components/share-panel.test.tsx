// @vitest-environment jsdom
/**
 * SharePanel / toShareText テスト（task 8.3 / Req 5.1, 5.2）
 *
 * 検証:
 *  - toShareText(result): クラス名・称号ラベルを含む（R5.1）。
 *  - toShareText(result): 回答ラベル・ベクトル数値・その他 PII を含めない（R5.2）。
 *  - SharePanel: 共有テキストのプレビューと共有/コピーボタンを描画する。
 *  - ボタン押下で navigator.clipboard.writeText が共有テキストで呼ばれ、確認表示が出る。
 */

import type { ClassResult } from '@bulr/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SharePanel, toShareText } from './share-panel';
import { TITLE_LABELS } from '../_lib/definitions';
import { ARCHETYPES } from '../_lib/archetype/definitions';
import { resolveArchetype } from '../_lib/archetype/resolve';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// PII とみなす識別可能な文字列（回答ラベル相当）と識別可能なベクトル数値。
const DISTINCTIVE_ANSWER = 'ヒミツの回答ラベル';
const DISTINCTIVE_SCORE = 77.7;

function makeResult(overrides: Partial<ClassResult> = {}): ClassResult {
  return {
    primaryVocation: 'vanguard',
    subVocations: ['rearguard'],
    vocationVector: {
      vanguard: DISTINCTIVE_SCORE,
      rearguard: 42,
      guardian: 10,
      sage: 5,
      commander: 3,
      strategist: 2,
      ranger: 1,
    },
    temperament: {
      poles: {
        explorationDeepening: 'deepener',
        soloCollaboration: 'solo',
        planningImprovisation: 'planner',
        stabilityChallenge: 'stabilizer',
      },
      balancedAxes: [],
      code: 'deepener-solo-planner-stabilizer',
      completeness: 'full',
    },
    title: 'specialist',
    representativeVocation: 'vanguard',
    className: 'スペシャリスト・孤高の深化者な前衛',
    confidence: 'normal',
    ...overrides,
  };
}

describe('toShareText', () => {
  it('クラス名・称号ラベルを含む (R5.1)', () => {
    const result = makeResult();
    const text = toShareText(result);

    expect(text).toContain(result.className);
    expect(text).toContain(TITLE_LABELS[result.title]);
  });

  it('先頭に主アーキタイプ名を含み、クラス名・称号を補助的に残す (R7.1/7.2)', () => {
    const result = makeResult();
    const expected = ARCHETYPES[resolveArchetype(result)];
    const text = toShareText(result);
    const firstLine = text.split('\n')[0];

    // 先頭行にアーキタイプ名（R7.1）
    expect(firstLine).toContain(expected.name);
    // クラス名・称号は補助行として保持（R7.2）
    expect(text).toContain(result.className);
    expect(text).toContain(TITLE_LABELS[result.title]);
  });

  it('回答ラベル・ベクトル数値などの PII を含めない (R5.2)', () => {
    const result = makeResult();
    const text = toShareText(result);

    // 回答内容（PII 相当）は含めない。
    expect(text).not.toContain(DISTINCTIVE_ANSWER);
    // ベクトル数値は含めない。
    expect(text).not.toContain(String(DISTINCTIVE_SCORE));
    // 一切の数字を含めない（R5.2 の厳格運用）。
    expect(text).not.toMatch(/\d/);
  });
});

describe('SharePanel', () => {
  it('共有テキストのプレビューと共有ボタンを描画する', () => {
    const result = makeResult();
    render(<SharePanel result={result} />);

    // toHaveTextContent は空白を正規化するため、共有テキストの各行を分けて検査する。
    const preview = screen.getByTestId('share-panel-preview');
    for (const line of toShareText(result).split('\n')) {
      expect(preview).toHaveTextContent(line);
    }
    expect(screen.getByTestId('share-panel-button')).toBeInTheDocument();
  });

  it('ボタン押下で共有テキストがクリップボードにコピーされ確認が出る', async () => {
    const result = makeResult();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SharePanel result={result} />);

    fireEvent.click(screen.getByTestId('share-panel-button'));

    expect(writeText).toHaveBeenCalledWith(toShareText(result));

    // コピー完了の確認表示。
    expect(await screen.findByTestId('share-panel-copied')).toBeInTheDocument();
  });
});

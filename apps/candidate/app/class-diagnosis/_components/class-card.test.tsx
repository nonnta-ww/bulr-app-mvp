// @vitest-environment jsdom
/**
 * ClassCard UI テスト（task 8.2 / Req 4.1, 4.3, 4.4, 7.3）
 *
 * 検証:
 *  - 確定診断（flavor 非null）: className・職掌/称号/気質ラベル・フレーバー文が表示される（R4.1）。
 *  - flavor=null（LLM 失敗）: テンプレートフォールバックで完全に描画される（R7.3）。
 *  - partial 診断（temperament=null）: 「気質未診断」ヒントが出て破綻しない（R8.2）。
 *  - 数値スコア（ベクトル値・信頼度数値）は一切表示しない（R4.4）。
 *  - 隣接クラスの成長ヒント（nextStepHint 相当）が表示される（R4.3）。
 */

import type { ClassResult, ClassFlavor } from '@bulr/types';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ClassCard } from './class-card';

afterEach(cleanup);

// ベクトルに識別可能な数値（87.5）を含めて、DOM に漏れていないことを検査する。
const DISTINCTIVE_SCORE = 87.5;

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
    temperament: 'deepener_solo',
    temperamentBalanced: false,
    title: 'specialist',
    representativeVocation: 'vanguard',
    className: 'スペシャリスト・孤高の深化者な前衛',
    confidence: 'normal',
    ...overrides,
  };
}

const FULL_FLAVOR: ClassFlavor = {
  tagline: '静かに深く磨き上げる前衛職人',
  description: 'あなたはフロントエンドの前衛として一点を深く掘り下げるタイプです。',
  nextStepHint: 'あと少しバックエンド連携を深めると後衛の色が強まります。',
};

describe('ClassCard', () => {
  it('確定診断: className・職掌/称号/気質ラベル・フレーバー文を表示する (R4.1)', () => {
    render(<ClassCard result={makeResult()} flavor={FULL_FLAVOR} />);

    expect(screen.getByText('スペシャリスト・孤高の深化者な前衛')).toBeInTheDocument();
    // 主職掌ラベル（バッジ）
    expect(screen.getByTestId('class-card-vocation')).toHaveTextContent('前衛');
    // 称号・気質のバッジラベル
    expect(screen.getByText('スペシャリスト')).toBeInTheDocument();
    expect(screen.getByText('孤高の深化者')).toBeInTheDocument();
    // フレーバー文
    expect(screen.getByText(FULL_FLAVOR.tagline)).toBeInTheDocument();
    expect(screen.getByText(FULL_FLAVOR.description)).toBeInTheDocument();
  });

  it('隣接クラスの成長ヒントを表示する (R4.3)', () => {
    render(<ClassCard result={makeResult()} flavor={FULL_FLAVOR} />);
    expect(screen.getByText(FULL_FLAVOR.nextStepHint)).toBeInTheDocument();
  });

  it('flavor=null（LLM失敗）でもテンプレートフォールバックで完全描画する (R7.3)', () => {
    render(<ClassCard result={makeResult()} flavor={null} />);

    // カードの主要要素（className・職掌ラベル）は依然として揃う
    expect(screen.getByText('スペシャリスト・孤高の深化者な前衛')).toBeInTheDocument();
    expect(screen.getByTestId('class-card-vocation')).toHaveTextContent('前衛');
    // テンプレート由来の説明文（ラベルから組成）と成長ヒントが出る
    expect(screen.getByTestId('class-card-tagline')).toBeInTheDocument();
    expect(screen.getByTestId('class-card-description')).toBeInTheDocument();
    expect(screen.getByTestId('class-card-next-step')).toBeInTheDocument();
    // 空文字ではない
    expect(screen.getByTestId('class-card-description').textContent?.trim()).not.toBe('');
    expect(screen.getByTestId('class-card-next-step').textContent?.trim()).not.toBe('');
  });

  it('partial 診断（temperament=null）は「気質未診断」ヒントを出して破綻しない (R8.2)', () => {
    render(
      <ClassCard
        result={makeResult({
          temperament: null,
          className: 'スペシャリスト・前衛',
        })}
        flavor={FULL_FLAVOR}
      />,
    );
    expect(screen.getByText('スペシャリスト・前衛')).toBeInTheDocument();
    expect(screen.getByText(/気質未診断/)).toBeInTheDocument();
  });

  it('confidence=low は数値なしの注意書きのみを表示する (R4.4)', () => {
    render(<ClassCard result={makeResult({ confidence: 'low' })} flavor={FULL_FLAVOR} />);
    expect(screen.getByText(/参考値/)).toBeInTheDocument();
  });

  it('数値スコア（ベクトル値）を一切表示しない (R4.4)', () => {
    const { container } = render(<ClassCard result={makeResult()} flavor={FULL_FLAVOR} />);
    // 識別可能なベクトル値が DOM に現れない
    expect(container.textContent).not.toContain(String(DISTINCTIVE_SCORE));
    expect(container.textContent).not.toContain('42');
  });
});

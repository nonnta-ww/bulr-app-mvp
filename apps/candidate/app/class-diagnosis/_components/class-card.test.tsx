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

import type {
  ClassResult,
  ClassFlavor,
  TemperamentSummary,
} from '@bulr/types';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ClassCard } from './class-card';
import { TEMPERAMENT_ARCHETYPES } from '../../_lib/temperament/archetypes';
import { ARCHETYPES } from '../_lib/archetype/definitions';
import { resolveArchetype } from '../_lib/archetype/resolve';

afterEach(cleanup);

// ベクトルに識別可能な数値（87.5）を含めて、DOM に漏れていないことを検査する。
const DISTINCTIVE_SCORE = 87.5;

// full 診断: 4軸すべて determined、code 確定（アーキタイプあり）。
const FULL_TEMPERAMENT: TemperamentSummary = {
  poles: {
    explorationDeepening: 'deepener',
    soloCollaboration: 'solo',
    planningImprovisation: 'planner',
    stabilityChallenge: 'stabilizer',
  },
  balancedAxes: [],
  code: 'deepener-solo-planner-stabilizer',
  completeness: 'full',
};

// partial 診断: 一部の軸のみ determined、code は null。
const PARTIAL_TEMPERAMENT: TemperamentSummary = {
  poles: {
    explorationDeepening: 'deepener',
    soloCollaboration: 'solo',
  },
  balancedAxes: [],
  code: null,
  completeness: 'partial',
};

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
    temperament: FULL_TEMPERAMENT,
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
  it('full 診断: className・職掌/称号・アーキタイプ shortLabel・フレーバー文を表示する (R4.1/7.2)', () => {
    render(<ClassCard result={makeResult()} flavor={FULL_FLAVOR} />);

    expect(screen.getByText('スペシャリスト・孤高の深化者な前衛')).toBeInTheDocument();
    // 主職掌ラベル（バッジ）
    expect(screen.getByTestId('class-card-vocation')).toHaveTextContent('前衛');
    // 称号ラベル
    expect(screen.getByText('スペシャリスト')).toBeInTheDocument();
    // 気質バッジはアーキタイプの shortLabel を表示する（full）
    const archetype = TEMPERAMENT_ARCHETYPES['deepener-solo-planner-stabilizer'];
    expect(screen.getByTestId('class-card-temperament')).toHaveTextContent(
      archetype.shortLabel,
    );
    // partial 注記は出ない
    expect(screen.queryByTestId('class-card-temperament-partial-note')).toBeNull();
    // フレーバー文
    expect(screen.getByText(FULL_FLAVOR.tagline)).toBeInTheDocument();
    expect(screen.getByText(FULL_FLAVOR.description)).toBeInTheDocument();
  });

  it('partial 診断: 確定した極ラベルを表示し、タイプを捏造しない (R7.4)', () => {
    render(
      <ClassCard
        result={makeResult({ temperament: PARTIAL_TEMPERAMENT })}
        flavor={null}
      />,
    );

    // 確定した極ラベル（探索軸=深化 / 社会軸=個人）が '・' 連結で表示される
    const badge = screen.getByTestId('class-card-temperament');
    expect(badge).toHaveTextContent('深化・個人');
    // 残り設問への案内注記（R7.4）
    expect(
      screen.getByTestId('class-card-temperament-partial-note'),
    ).toBeInTheDocument();
    // full アーキタイプ（shortLabel/name）は捏造されない
    const archetype = TEMPERAMENT_ARCHETYPES['deepener-solo-planner-stabilizer'];
    expect(badge.textContent).not.toContain(archetype.shortLabel);
    expect(screen.queryByText(new RegExp(archetype.name))).toBeNull();
    // 気質未診断バッジは出ない
    expect(screen.queryByTestId('class-card-temperament-missing')).toBeNull();
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

describe('ClassCard — アーキタイプ主役 (spec: diagnosis-archetypes)', () => {
  it('ヒーロー=アーキタイプ名＋一行説明＋シンボル、副題=className を表示する (R4.1/4.2/4.3/6.2)', () => {
    const result = makeResult();
    const expected = ARCHETYPES[resolveArchetype(result)];

    const { container } = render(<ClassCard result={result} flavor={FULL_FLAVOR} />);

    // ヒーロー: 導出されたアーキタイプ名と一行説明
    expect(screen.getByTestId('class-card-archetype-name')).toHaveTextContent(expected.name);
    expect(screen.getByTestId('class-card-archetype-tagline')).toHaveTextContent(expected.tagline);
    // シンボル（自己完結 SVG, role=img）
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
    // 従来の説明的クラス名は副題として残る
    expect(screen.getByTestId('class-card-classname')).toHaveTextContent(result.className);
  });

  it('ゲーム風異名をおまけ（従属）として表示する (R5.2)', () => {
    const result = makeResult();
    const expected = ARCHETYPES[resolveArchetype(result)];
    render(<ClassCard result={result} flavor={FULL_FLAVOR} />);
    expect(screen.getByTestId('class-card-game-alias')).toHaveTextContent(expected.gameAlias);
  });

  it('称号ラベルを併記する (R4.4)', () => {
    render(<ClassCard result={makeResult()} flavor={FULL_FLAVOR} />);
    // title='specialist' → 「スペシャリスト」バッジ
    expect(screen.getByText('スペシャリスト')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * playstyle-result.test.tsx — PlaystyleResult UI テスト（task 4.2 / R2.1, R2.3, R3.1, R3.2, R3.3）
 *
 * 検証:
 *  - none: 気質タイプを提示せず、アンケート回答を促す CTA（href=渡した href）を表示（R3.1）。
 *  - partial: AxisBars を描画し、残軸に回答すると確定する旨＋CTA を表示。アーキタイプは出さない（R3.2）。
 *  - full: 確定16タイプのアーキタイプ（name/description/nextStep）＋AxisBars＋SharePanel を表示（R2.1/R3.3）。
 *  - R2.3: PlaystyleResult 自体が数値スコアを描画しない（full コンテナに '%' が出ない）。
 *
 * 実データ（scoreTemperament の TemperamentProfile）を用いて検証する。standalone と
 * クラス診断の両方から使う単一実装。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { AXES } from '../../_lib/temperament/axes';
import { TEMPERAMENT_ARCHETYPES } from '../../_lib/temperament/archetypes';
import {
  scoreTemperament,
  type TemperamentAnswer,
} from '../../_lib/temperament/score';
import { PlaystyleResult } from './playstyle-result';

afterEach(cleanup);

const HREF = '/playstyle-diagnosis/survey?next=class';

/** level=maxLevel（=100% 寄り＝第2極 high）の回答を1問作る。 */
function high(axis: (typeof AXES)[number]): TemperamentAnswer {
  return { axis, level: 4, reverse: false, maxLevel: 4 };
}

/** level=0（=0% 寄り＝第1極 low）の回答を1問作る。 */
function low(axis: (typeof AXES)[number]): TemperamentAnswer {
  return { axis, level: 0, reverse: false, maxLevel: 4 };
}

/** 全16アーキタイプ名（partial/none で漏れ出していないことの確認に使う）。 */
const ALL_ARCHETYPE_NAMES = Object.values(TEMPERAMENT_ARCHETYPES).map(
  (a) => a.name,
);

describe('PlaystyleResult', () => {
  it('none: アンケート誘導 CTA を表示しアーキタイプを出さない (R3.1)', () => {
    const profile = scoreTemperament([]);
    expect(profile.completeness).toBe('none');

    render(<PlaystyleResult profile={profile} playstyleSurveyHref={HREF} />);

    // none 状態のコンテナ。
    expect(screen.getByTestId('playstyle-result-none')).toBeInTheDocument();

    // CTA は渡した href を指す。
    const cta = screen.getByTestId('playstyle-cta');
    expect(cta).toHaveAttribute('href', HREF);

    // アーキタイプ名は一切出ない。
    const containerText =
      screen.getByTestId('playstyle-result').textContent ?? '';
    for (const name of ALL_ARCHETYPE_NAMES) {
      expect(containerText).not.toContain(name);
    }
    // AxisBars（型を示唆する）は none では出さない。
    expect(screen.queryByTestId('axis-bars')).toBeNull();
  });

  it('partial: AxisBars＋残軸導線＋CTA を表示しアーキタイプを出さない (R3.2)', () => {
    // 2軸のみ回答 → partial。
    const profile = scoreTemperament([
      high('explorationDeepening'),
      low('soloCollaboration'),
    ]);
    expect(profile.completeness).toBe('partial');

    render(<PlaystyleResult profile={profile} playstyleSurveyHref={HREF} />);

    expect(screen.getByTestId('playstyle-result-partial')).toBeInTheDocument();

    // 判定済み軸の寄り = AxisBars を描画する。
    expect(screen.getByTestId('axis-bars')).toBeInTheDocument();

    // 残軸に回答すると確定する旨の導線＋CTA（href）。
    const partial = within(screen.getByTestId('playstyle-result-partial'));
    // 「残軸に回答すると確定する」旨の導線メッセージ（複数要素に跨る想定）。
    expect(partial.getAllByText(/確定/).length).toBeGreaterThan(0);
    const cta = screen.getByTestId('playstyle-cta');
    expect(cta).toHaveAttribute('href', HREF);

    // アーキタイプは partial では確定させない。
    const containerText =
      screen.getByTestId('playstyle-result').textContent ?? '';
    for (const name of ALL_ARCHETYPE_NAMES) {
      expect(containerText).not.toContain(name);
    }
    // SharePanel は full のみ。
    expect(screen.queryByTestId('playstyle-share-panel')).toBeNull();
  });

  it('full: アーキタイプ（name/description/nextStep）＋AxisBars＋SharePanel を表示 (R2.1, R3.3)', () => {
    const profile = scoreTemperament([
      high('explorationDeepening'),
      low('soloCollaboration'),
      high('planningImprovisation'),
      low('stabilityChallenge'),
    ]);
    expect(profile.completeness).toBe('full');
    expect(profile.code).not.toBeNull();

    const archetype = TEMPERAMENT_ARCHETYPES[profile.code!];

    render(<PlaystyleResult profile={profile} playstyleSurveyHref={HREF} />);

    expect(screen.getByTestId('playstyle-result-full')).toBeInTheDocument();

    const full = within(screen.getByTestId('playstyle-result-full'));
    // アーキタイプ名・説明・次の一歩（キュレーテッド文言）。
    expect(full.getByText(archetype.name)).toBeInTheDocument();
    expect(full.getByText(archetype.description)).toBeInTheDocument();
    expect(full.getByText(archetype.nextStep)).toBeInTheDocument();

    // AxisBars（4軸）＋SharePanel。
    expect(screen.getByTestId('axis-bars')).toBeInTheDocument();
    expect(screen.getByTestId('playstyle-share-panel')).toBeInTheDocument();
  });

  it('full: PlaystyleResult 自体が数値スコアを描画しない (R2.3)', () => {
    const profile = scoreTemperament([
      high('explorationDeepening'),
      low('soloCollaboration'),
      high('planningImprovisation'),
      low('stabilityChallenge'),
    ]);

    render(<PlaystyleResult profile={profile} playstyleSurveyHref={HREF} />);

    const containerText =
      screen.getByTestId('playstyle-result').textContent ?? '';
    // パーセント・生スコア数値が漏れない（AxisBars は position-only）。
    expect(containerText).not.toContain('%');
    for (const axis of AXES) {
      const rawScore = String(profile.axes[axis].score);
      expect(containerText).not.toContain(rawScore);
    }
  });
});

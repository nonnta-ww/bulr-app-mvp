// @vitest-environment jsdom
/**
 * thinking-style-result.test.tsx — ThinkingStyleResult UI テスト（task 4.2 / R2.1, R2.3, R3.1, R3.2, R3.3）
 *
 * 検証:
 *  - none: 思考スタイルタイプを提示せず、アンケート回答を促す CTA（href=渡した href）を表示（R3.1）。
 *  - partial: AxisBars を描画し、残軸に回答すると確定する旨＋CTA を表示。アーキタイプは出さない（R3.2）。
 *  - full: 確定16タイプのアーキタイプ（name/description/nextStep）＋AxisBars＋SharePanel を表示（R2.1/R3.3）。
 *  - R2.3: ThinkingStyleResult 自体が数値スコアを描画しない（full コンテナに '%' が出ない）。
 *
 * 実データ（scoreThinkingStyle の ThinkingStyleProfile）を用いて検証する。standalone と
 * クラス診断の両方から使う単一実装。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { AXES } from '../../_lib/thinking-style/axes';
import { THINKING_STYLE_ARCHETYPES } from '../../_lib/thinking-style/archetypes';
import {
  scoreThinkingStyle,
  type ThinkingStyleAnswer,
} from '../../_lib/thinking-style/score';
import { ThinkingStyleResult } from './thinking-style-result';

afterEach(cleanup);

const HREF = '/thinking-style-diagnosis/survey?next=class';

/** level=maxLevel（=100% 寄り＝第2極 high）の回答を1問作る。 */
function high(axis: (typeof AXES)[number]): ThinkingStyleAnswer {
  return { axis, level: 4, reverse: false, maxLevel: 4 };
}

/** level=0（=0% 寄り＝第1極 low）の回答を1問作る。 */
function low(axis: (typeof AXES)[number]): ThinkingStyleAnswer {
  return { axis, level: 0, reverse: false, maxLevel: 4 };
}

/** 全16アーキタイプ名（partial/none で漏れ出していないことの確認に使う）。 */
const ALL_ARCHETYPE_NAMES = Object.values(THINKING_STYLE_ARCHETYPES).map(
  (a) => a.name,
);

describe('ThinkingStyleResult', () => {
  it('none: アンケート誘導 CTA を表示しアーキタイプを出さない (R3.1)', () => {
    const profile = scoreThinkingStyle([]);
    expect(profile.completeness).toBe('none');

    render(
      <ThinkingStyleResult
        profile={profile}
        thinkingStyleSurveyHref={HREF}
      />,
    );

    // none 状態のコンテナ。
    expect(
      screen.getByTestId('thinking-style-result-none'),
    ).toBeInTheDocument();

    // CTA は渡した href を指す。
    const cta = screen.getByTestId('thinking-style-cta');
    expect(cta).toHaveAttribute('href', HREF);

    // アーキタイプ名は一切出ない。
    const containerText =
      screen.getByTestId('thinking-style-result').textContent ?? '';
    for (const name of ALL_ARCHETYPE_NAMES) {
      expect(containerText).not.toContain(name);
    }
    // AxisBars（型を示唆する）は none では出さない。
    expect(screen.queryByTestId('axis-bars')).toBeNull();
  });

  it('partial: AxisBars＋残軸導線＋CTA を表示しアーキタイプを出さない (R3.2)', () => {
    // 2軸のみ回答 → partial。
    const profile = scoreThinkingStyle([
      high('abstractConcrete'),
      low('logicIntuition'),
    ]);
    expect(profile.completeness).toBe('partial');

    render(
      <ThinkingStyleResult
        profile={profile}
        thinkingStyleSurveyHref={HREF}
      />,
    );

    expect(
      screen.getByTestId('thinking-style-result-partial'),
    ).toBeInTheDocument();

    // 判定済み軸の寄り = AxisBars を描画する。
    expect(screen.getByTestId('axis-bars')).toBeInTheDocument();

    // 残軸に回答すると確定する旨の導線＋CTA（href）。
    const partial = within(
      screen.getByTestId('thinking-style-result-partial'),
    );
    // 「残軸に回答すると確定する」旨の導線メッセージ（複数要素に跨る想定）。
    expect(partial.getAllByText(/確定/).length).toBeGreaterThan(0);
    const cta = screen.getByTestId('thinking-style-cta');
    expect(cta).toHaveAttribute('href', HREF);

    // アーキタイプは partial では確定させない。
    const containerText =
      screen.getByTestId('thinking-style-result').textContent ?? '';
    for (const name of ALL_ARCHETYPE_NAMES) {
      expect(containerText).not.toContain(name);
    }
    // SharePanel は full のみ。
    expect(screen.queryByTestId('thinking-style-share-panel')).toBeNull();
  });

  it('full: アーキタイプ（name/description/nextStep）＋AxisBars＋SharePanel を表示 (R2.1, R3.3)', () => {
    const profile = scoreThinkingStyle([
      high('abstractConcrete'),
      low('logicIntuition'),
      high('convergentDivergent'),
      low('theoryPractice'),
    ]);
    expect(profile.completeness).toBe('full');
    expect(profile.code).not.toBeNull();

    const archetype = THINKING_STYLE_ARCHETYPES[profile.code!];

    render(
      <ThinkingStyleResult
        profile={profile}
        thinkingStyleSurveyHref={HREF}
      />,
    );

    expect(
      screen.getByTestId('thinking-style-result-full'),
    ).toBeInTheDocument();

    const full = within(screen.getByTestId('thinking-style-result-full'));
    // アーキタイプ名・説明・次の一歩（キュレーテッド文言）。
    expect(full.getByText(archetype.name)).toBeInTheDocument();
    expect(full.getByText(archetype.description)).toBeInTheDocument();
    expect(full.getByText(archetype.nextStep)).toBeInTheDocument();

    // AxisBars（4軸）＋SharePanel。
    expect(screen.getByTestId('axis-bars')).toBeInTheDocument();
    expect(
      screen.getByTestId('thinking-style-share-panel'),
    ).toBeInTheDocument();
  });

  it('full: ThinkingStyleResult 自体が数値スコアを描画しない (R2.3)', () => {
    const profile = scoreThinkingStyle([
      high('abstractConcrete'),
      low('logicIntuition'),
      high('convergentDivergent'),
      low('theoryPractice'),
    ]);

    render(
      <ThinkingStyleResult
        profile={profile}
        thinkingStyleSurveyHref={HREF}
      />,
    );

    const containerText =
      screen.getByTestId('thinking-style-result').textContent ?? '';
    // パーセント・生スコア数値が漏れない（AxisBars は position-only）。
    expect(containerText).not.toContain('%');
    for (const axis of AXES) {
      const rawScore = String(profile.axes[axis].score);
      expect(containerText).not.toContain(rawScore);
    }
  });
});

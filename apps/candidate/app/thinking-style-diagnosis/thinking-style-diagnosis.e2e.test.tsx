// @vitest-environment jsdom
/**
 * thinking-style-diagnosis.e2e.test.tsx — 独立体験と導線の横断検証（task 5.1 / R2.2, R2.3, R3.1, R3.2, R3.3, R4.1, R4.2, R4.3, R6.2）
 *
 * 個別コンポーネントテスト（4.1/4.2/4.3）を再現するのではなく、思考スタイル診断の
 * 独立体験を1本に束ねて横断的に検証する:
 *
 *  1. 実データ（scoreThinkingStyle の ThinkingStyleProfile）で none/partial/full を
 *     ThinkingStyleResult に流し、いずれの状態でも数値スコア（%・生スコア）が
 *     一切露出しないこと（R2.2, R2.3, R3.1, R3.2, R3.3）。
 *  2. none/partial の CTA が親から渡した思考スタイルアンケートへの deep-link href を
 *     そのまま指すこと（R6.x deep-link をコンポーネント境界で検証）。
 *  3. ナビに /thinking-style-diagnosis 入口（label『思考スタイル診断』）が存在すること
 *     — 独立体験への到達導線（R6.2）。既存テスト未カバー。
 *  4. 共有テキスト（toThinkingStyleShareText）が full 結果からアーキタイプ名のみで組成され、
 *     description/nextStep/極コードなどの PII も数字も一切含まないこと（R4.1, R4.2, R4.3）。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { NAV_ITEMS, isActive } from '../_components/nav-items';
import { AXES } from '../_lib/thinking-style/axes';
import { THINKING_STYLE_ARCHETYPES } from '../_lib/thinking-style/archetypes';
import {
  scoreThinkingStyle,
  type ThinkingStyleAnswer,
  type ThinkingStyleProfile,
} from '../_lib/thinking-style/score';
import { ThinkingStyleResult } from './_components/thinking-style-result';
import { toThinkingStyleShareText } from './_components/thinking-style-share-panel';

afterEach(cleanup);

/** 親 page が解決するのと同型の思考スタイルアンケート deep-link。 */
const SURVEY_HREF = '/skill-survey/thinking-style-survey-id';

/** level=max（=第2極 high 寄り）の回答を1問。 */
function high(axis: (typeof AXES)[number]): ThinkingStyleAnswer {
  return { axis, level: 4, reverse: false, maxLevel: 4 };
}

/** level=0（=第1極 low 寄り）の回答を1問。 */
function low(axis: (typeof AXES)[number]): ThinkingStyleAnswer {
  return { axis, level: 0, reverse: false, maxLevel: 4 };
}

/** full な profile（4軸すべて回答済み）。code は非null。 */
function fullProfile(): ThinkingStyleProfile {
  const profile = scoreThinkingStyle([
    high('abstractConcrete'),
    low('logicIntuition'),
    high('convergentDivergent'),
    low('theoryPractice'),
  ]);
  return profile;
}

/** 描画コンテナ全体に数値スコア（%・各軸の生スコア）が漏れていないこと。 */
function expectNoNumericScore(profile: ThinkingStyleProfile) {
  const text = screen.getByTestId('thinking-style-result').textContent ?? '';
  expect(text).not.toContain('%');
  for (const axis of AXES) {
    expect(text).not.toContain(String(profile.axes[axis].score));
  }
}

describe('思考スタイル診断 — 独立体験と導線（横断検証, task 5.1）', () => {
  describe('結果表示: none/partial/full で数値スコアを一切出さない (R2.2, R2.3)', () => {
    it('none: 数値スコアなし・CTA が deep-link href を指す (R3.1, R6.x)', () => {
      const profile = scoreThinkingStyle([]);
      expect(profile.completeness).toBe('none');

      render(
        <ThinkingStyleResult
          profile={profile}
          thinkingStyleSurveyHref={SURVEY_HREF}
        />,
      );

      expect(
        screen.getByTestId('thinking-style-result-none'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('thinking-style-cta')).toHaveAttribute(
        'href',
        SURVEY_HREF,
      );
      expectNoNumericScore(profile);
    });

    it('partial: 数値スコアなし・CTA が deep-link href を指す (R3.2, R6.x)', () => {
      const profile = scoreThinkingStyle([
        high('abstractConcrete'),
        low('logicIntuition'),
      ]);
      expect(profile.completeness).toBe('partial');

      render(
        <ThinkingStyleResult
          profile={profile}
          thinkingStyleSurveyHref={SURVEY_HREF}
        />,
      );

      expect(
        screen.getByTestId('thinking-style-result-partial'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('thinking-style-cta')).toHaveAttribute(
        'href',
        SURVEY_HREF,
      );
      expectNoNumericScore(profile);
    });

    it('full: アーキタイプは提示するが数値スコアは一切出さない (R3.3, R2.3)', () => {
      const profile = fullProfile();
      expect(profile.completeness).toBe('full');
      expect(profile.code).not.toBeNull();

      render(
        <ThinkingStyleResult
          profile={profile}
          thinkingStyleSurveyHref={SURVEY_HREF}
        />,
      );

      const archetype = THINKING_STYLE_ARCHETYPES[profile.code!];
      expect(
        screen.getByTestId('thinking-style-result-full'),
      ).toBeInTheDocument();
      // アーキタイプは提示される（独立体験の核）。
      expect(screen.getByText(archetype.name)).toBeInTheDocument();
      // ただし数値スコアは露出しない。
      expectNoNumericScore(profile);
    });
  });

  describe('導線: ナビに独立体験への入口が存在する (R6.2)', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/thinking-style-diagnosis');

    it('/thinking-style-diagnosis 項目が label『思考スタイル診断』で存在する', () => {
      expect(item).toBeDefined();
      expect(item?.label).toBe('思考スタイル診断');
      expect(item?.symbol).toBeTruthy();
    });

    it('prefix マッチで自身・配下は点灯し、隣接診断では点灯しない', () => {
      expect(item).toBeDefined();
      if (!item) return;
      expect(item.match).toBe('prefix');
      expect(isActive('/thinking-style-diagnosis', item)).toBe(true);
      expect(isActive('/thinking-style-diagnosis/anything', item)).toBe(true);
      // 隣接する別診断では点灯しない（独立導線）。
      expect(isActive('/playstyle-diagnosis', item)).toBe(false);
    });
  });

  describe('共有: full 結果の共有テキストが PII・数字フリー (R4.1, R4.2, R4.3)', () => {
    it('アーキタイプ名を含み、説明/次の一歩/極コード/数字を含めない', () => {
      const profile = fullProfile();
      const archetype = THINKING_STYLE_ARCHETYPES[profile.code!];

      const text = toThinkingStyleShareText(archetype);

      // アーキタイプ名は含む（R4.1）。
      expect(text).toContain(archetype.name);
      // 回答由来の PII 相当（description/nextStep）は含めない（R4.2）。
      expect(text).not.toContain(archetype.description);
      expect(text).not.toContain(archetype.nextStep);
      // 内部識別子（極コード）を含めない。
      expect(text).not.toContain(profile.code);
      // 数字を一切含めない（R4.2 の厳格運用: スコア・数値排除）。
      expect(text).not.toMatch(/\d/);
    });

    it('共有テキストは現在の診断結果のみから導出される（追加永続化なし・R4.3）', () => {
      // 同一アーキタイプ → 同一テキスト（決定論・外部状態非依存）。
      const profile = fullProfile();
      const archetype = THINKING_STYLE_ARCHETYPES[profile.code!];
      expect(toThinkingStyleShareText(archetype)).toBe(
        toThinkingStyleShareText(archetype),
      );
    });
  });
});

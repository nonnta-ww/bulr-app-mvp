// @vitest-environment jsdom
/**
 * teamwork-style-diagnosis.e2e.test.tsx — 独立体験と導線の横断検証（task 7.3 / R3.2, R3.3, R3.4, R3.5, R4.4, R7.1, R7.2, R7.3, R7.4, R9.2）
 *
 * チームワーク・スタイル診断の独立体験を横断的に検証する:
 *  1. 実データ（scoreTeamworkStyle の profile）で none/partial/full を TeamworkStyleResult に流し、
 *     いずれの状態でも数値スコア（%・生スコア）が一切露出しないこと（R4.4, R9.2, R3.2-3.4）。
 *  2. none/partial の CTA が親から渡した deep-link href を指すこと。
 *  3. full でカルチャー親和性・（回答時）成長アドバイスが提示され、partial では出ないこと（R3.4, R3.5, R6.x）。
 *  4. ナビに /teamwork-style-diagnosis 入口（label『チームワーク・スタイル診断』）が存在すること（R2.1）。
 *  5. 共有テキスト（toTeamworkStyleShareText）が name＋catch のみで、description/nextStep/コード/数字を
 *     一切含まないこと（R7.1, R7.2, R7.4）。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { NAV_ITEMS, isActive } from '../_components/nav-items';
import { AXES } from '../_lib/teamwork-style/axes';
import { TEAMWORK_ARCHETYPES } from '../_lib/teamwork-style/archetypes';
import { deriveCultureAffinity } from '../_lib/teamwork-style/culture-affinity';
import { deriveGrowthAdvice } from '../_lib/teamwork-style/growth';
import {
  scoreTeamworkStyle,
  type TeamworkAnswer,
  type TeamworkProfile,
} from '../_lib/teamwork-style/score';
import { TeamworkStyleResult } from './_components/teamwork-style-result';
import { toTeamworkStyleShareText } from './_components/teamwork-style-share-panel';

afterEach(cleanup);

const SURVEY_HREF = '/skill-survey/teamwork-style-survey-id';

/** 第2極（高極）を選んだ回答を1問。 */
function high(axis: (typeof AXES)[number]): TeamworkAnswer {
  return { axis, pickedHighPole: true };
}
/** 第1極（低極）を選んだ回答を1問。 */
function low(axis: (typeof AXES)[number]): TeamworkAnswer {
  return { axis, pickedHighPole: false };
}

/** full な profile（4軸すべて回答済み・全て低極 → 'direct-task-dry-align'）。 */
function fullProfile(): TeamworkProfile {
  return scoreTeamworkStyle([
    low('candor'),
    low('decisionFocus'),
    low('distance'),
    low('dissent'),
  ]);
}

/** 描画コンテナ全体に数値スコア（%・各軸の生スコア）が漏れていないこと。 */
function expectNoNumericScore(profile: TeamworkProfile) {
  const text = screen.getByTestId('teamwork-style-result').textContent ?? '';
  expect(text).not.toContain('%');
  for (const axis of AXES) {
    expect(text).not.toContain(String(profile.axes[axis].score));
  }
}

describe('チームワーク・スタイル診断 — 独立体験と導線（横断検証, task 7.3）', () => {
  describe('結果表示: none/partial/full で数値スコアを一切出さない (R4.4, R9.2)', () => {
    it('none: 数値スコアなし・CTA が deep-link href を指す (R3.2)', () => {
      const profile = scoreTeamworkStyle([]);
      expect(profile.completeness).toBe('none');

      render(
        <TeamworkStyleResult
          profile={profile}
          growthAdvice={[]}
          cultureAffinity={null}
          surveyHref={SURVEY_HREF}
        />,
      );

      expect(screen.getByTestId('teamwork-style-result-none')).toBeInTheDocument();
      expect(screen.getByTestId('teamwork-style-cta')).toHaveAttribute('href', SURVEY_HREF);
      expectNoNumericScore(profile);
    });

    it('partial: 数値なし・アーキタイプ名なし・カルチャーなし・CTA が href を指す (R3.3)', () => {
      const profile = scoreTeamworkStyle([high('candor'), low('distance')]);
      expect(profile.completeness).toBe('partial');

      render(
        <TeamworkStyleResult
          profile={profile}
          growthAdvice={[]}
          cultureAffinity={null}
          surveyHref={SURVEY_HREF}
        />,
      );

      expect(screen.getByTestId('teamwork-style-result-partial')).toBeInTheDocument();
      expect(screen.getByTestId('teamwork-style-cta')).toHaveAttribute('href', SURVEY_HREF);
      expect(screen.getByTestId('axis-bars')).toBeInTheDocument();
      // アーキタイプ名・カルチャーは partial では出さない。
      const containerText = screen.getByTestId('teamwork-style-result').textContent ?? '';
      for (const a of Object.values(TEAMWORK_ARCHETYPES)) {
        expect(containerText).not.toContain(a.name);
      }
      expect(screen.queryByTestId('teamwork-style-culture-affinity')).toBeNull();
      expect(screen.queryByTestId('teamwork-style-share-panel')).toBeNull();
      expectNoNumericScore(profile);
    });

    it('full: アーキタイプ＋カルチャー＋（回答時）成長を提示するが数値は出さない (R3.4, R3.5)', () => {
      const profile = fullProfile();
      expect(profile.completeness).toBe('full');
      expect(profile.code).not.toBeNull();

      const archetype = TEAMWORK_ARCHETYPES[profile.code!];
      const cultureAffinity = deriveCultureAffinity(profile.code ?? undefined);
      const growthAdvice = deriveGrowthAdvice([{ dimension: 'selfAwareness', level: 2 }]);

      render(
        <TeamworkStyleResult
          profile={profile}
          growthAdvice={growthAdvice}
          cultureAffinity={cultureAffinity}
          surveyHref={SURVEY_HREF}
        />,
      );

      const full = within(screen.getByTestId('teamwork-style-result-full'));
      // アーキタイプ（正式名＋キャッチ＋説明＋次の一歩）。
      expect(full.getByText(archetype.name)).toBeInTheDocument();
      expect(full.getByText(archetype.catch)).toBeInTheDocument();
      expect(full.getByText(archetype.description)).toBeInTheDocument();
      expect(full.getByText(archetype.nextStep)).toBeInTheDocument();
      // カルチャー親和性・成長アドバイス・共有パネル。
      expect(screen.getByTestId('teamwork-style-culture-affinity')).toBeInTheDocument();
      expect(screen.getByTestId('teamwork-style-growth')).toBeInTheDocument();
      expect(screen.getByTestId('growth-advice-selfAwareness')).toBeInTheDocument();
      expect(screen.getByTestId('teamwork-style-share-panel')).toBeInTheDocument();
      expectNoNumericScore(profile);
    });

    it('full: 成長ディメンション未回答なら成長セクションは出さない (R3.5)', () => {
      const profile = fullProfile();
      render(
        <TeamworkStyleResult
          profile={profile}
          growthAdvice={[]}
          cultureAffinity={deriveCultureAffinity(profile.code ?? undefined)}
          surveyHref={SURVEY_HREF}
        />,
      );
      expect(screen.queryByTestId('teamwork-style-growth')).toBeNull();
    });
  });

  describe('導線: ナビに独立体験への入口が存在する (R2.1)', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/teamwork-style-diagnosis');

    it('/teamwork-style-diagnosis 項目が label『チームワーク・スタイル診断』で存在する', () => {
      expect(item).toBeDefined();
      expect(item?.label).toBe('チームワーク・スタイル診断');
      expect(item?.symbol).toBeTruthy();
    });

    it('prefix マッチで自身・配下は点灯し、隣接診断では点灯しない', () => {
      expect(item).toBeDefined();
      if (!item) return;
      expect(item.match).toBe('prefix');
      expect(isActive('/teamwork-style-diagnosis', item)).toBe(true);
      expect(isActive('/teamwork-style-diagnosis/anything', item)).toBe(true);
      expect(isActive('/thinking-style-diagnosis', item)).toBe(false);
    });
  });

  describe('共有: full 結果の共有テキストが PII・数字フリー (R7.1, R7.2, R7.4)', () => {
    it('name＋catch を含み、説明/次の一歩/コード/数字を含めない', () => {
      const profile = fullProfile();
      const archetype = TEAMWORK_ARCHETYPES[profile.code!];

      const text = toTeamworkStyleShareText(archetype);

      expect(text).toContain(archetype.name);
      expect(text).toContain(archetype.catch);
      expect(text).not.toContain(archetype.description);
      expect(text).not.toContain(archetype.nextStep);
      expect(text).not.toContain(profile.code);
      expect(text).not.toMatch(/\d/);
    });

    it('共有テキストは現在の診断結果のみから導出される（決定論・R7.3 の一部）', () => {
      const profile = fullProfile();
      const archetype = TEAMWORK_ARCHETYPES[profile.code!];
      expect(toTeamworkStyleShareText(archetype)).toBe(toTeamworkStyleShareText(archetype));
    });

    it('clipboard/share API 不在の環境で共有ボタンを押してもクラッシュしない (R7.3)', () => {
      // jsdom では navigator.clipboard / navigator.share がともに未定義（＝API 不在環境）。
      expect(navigator.clipboard).toBeUndefined();
      expect(typeof (navigator as { share?: unknown }).share).not.toBe('function');

      const profile = fullProfile();
      render(
        <TeamworkStyleResult
          profile={profile}
          growthAdvice={[]}
          cultureAffinity={deriveCultureAffinity(profile.code ?? undefined)}
          surveyHref={SURVEY_HREF}
        />,
      );
      const button = screen.getByTestId('teamwork-style-share-button');
      // API 不在でも例外を投げず、成功状態（コピーしました）にもならない。
      expect(() => fireEvent.click(button)).not.toThrow();
      expect(screen.queryByTestId('teamwork-style-share-copied')).toBeNull();
    });
  });
});

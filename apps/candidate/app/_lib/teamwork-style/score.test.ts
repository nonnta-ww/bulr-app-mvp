/**
 * score.test.ts — 二者択一スコアリング純関数のユニットテスト（R3.2/R3.3/R3.4/R4.2/R4.3）。
 */

import { describe, expect, it } from "vitest";

import { AXES, AXIS_POLES } from "./axes";
import { deriveCode, scoreTeamworkStyle, type TeamworkAnswer } from "./score";

/** 全4軸に「pickedHighPole=value」の回答を1問ずつ作る。 */
function oneEach(pickedHighPole: boolean): TeamworkAnswer[] {
  return AXES.map((axis) => ({ axis, pickedHighPole }));
}

describe("scoreTeamworkStyle", () => {
  it("回答なし → completeness=none / code=null", () => {
    const profile = scoreTeamworkStyle([]);
    expect(profile.completeness).toBe("none");
    expect(profile.code).toBeNull();
    for (const axis of AXES) {
      expect(profile.axes[axis].determined).toBe(false);
    }
  });

  it("全4軸を高極ピック → full / 全て第2極の code", () => {
    const profile = scoreTeamworkStyle(oneEach(true));
    expect(profile.completeness).toBe("full");
    expect(profile.code).toBe("mediating-relational-wet-diverge");
    for (const axis of AXES) {
      expect(profile.axes[axis].pole).toBe(AXIS_POLES[axis].high);
      expect(profile.axes[axis].score).toBe(100);
    }
  });

  it("全4軸を低極ピック → full / 全て第1極の code", () => {
    const profile = scoreTeamworkStyle(oneEach(false));
    expect(profile.completeness).toBe("full");
    expect(profile.code).toBe("direct-task-dry-align");
    for (const axis of AXES) {
      expect(profile.axes[axis].pole).toBe(AXIS_POLES[axis].low);
      expect(profile.axes[axis].score).toBe(0);
    }
  });

  it("一部の軸のみ回答 → partial / code=null / アーキタイプ未確定", () => {
    const profile = scoreTeamworkStyle([
      { axis: "candor", pickedHighPole: true },
      { axis: "distance", pickedHighPole: false },
    ]);
    expect(profile.completeness).toBe("partial");
    expect(profile.code).toBeNull();
    expect(profile.axes.candor.determined).toBe(true);
    expect(profile.axes.decisionFocus.determined).toBe(false);
  });

  it("軸内多数決: 3問中2問が高極 → 第2極（score 66.67）", () => {
    const profile = scoreTeamworkStyle([
      { axis: "candor", pickedHighPole: true },
      { axis: "candor", pickedHighPole: true },
      { axis: "candor", pickedHighPole: false },
    ]);
    expect(profile.axes.candor.pole).toBe("mediating");
    expect(profile.axes.candor.score).toBe(66.67);
    expect(profile.axes.candor.balanced).toBe(false);
  });

  it("同数タイ（偶数問）→ 既定極（第1極）＋ balanced=true", () => {
    const profile = scoreTeamworkStyle([
      { axis: "candor", pickedHighPole: true },
      { axis: "candor", pickedHighPole: false },
    ]);
    expect(profile.axes.candor.score).toBe(50);
    expect(profile.axes.candor.balanced).toBe(true);
    expect(profile.axes.candor.pole).toBe("direct");
  });

  it("決定論: 同一入力 → 同一出力", () => {
    const input = oneEach(true);
    expect(scoreTeamworkStyle(input)).toEqual(scoreTeamworkStyle(input));
  });
});

describe("deriveCode", () => {
  it("入力キー順に依らず canonical order で連結する", () => {
    const code = deriveCode({
      dissent: "align",
      candor: "direct",
      distance: "dry",
      decisionFocus: "task",
    });
    expect(code).toBe("direct-task-dry-align");
  });
});

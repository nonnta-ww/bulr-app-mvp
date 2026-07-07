/**
 * title.ts のユニットテスト（純関数・決定論・R3.2–3.6）。
 *
 * 広さ(breadth) = ベクトルスコア >= BREADTH_ABS_THRESHOLD(60) の職掌数。
 * 深さ(depth)   = その対象職掌スコアの平均。
 * 広×深の2×2で 賢者/勇者・スペシャリスト・遊撃/よろず屋・見習い を決定する。
 */

import { describe, expect, it } from "vitest";

import type { Vocation } from "@bulr/types";

import {
  BREADTH_ABS_THRESHOLD,
  BREADTH_WIDE_MIN,
  DEPTH_DEEP_MIN,
  VOCATIONS,
} from "./definitions";
import { resolveTitle } from "./title";
import type { VocationResult } from "./vocation";

/**
 * スコア配列から VocationResult を組み立てる（vector のみ判定に効く）。
 * scores は VOCATIONS 順に割り当てる。primary/subs/totalAnswered は妥当な値で埋める。
 */
function makeResult(scores: number[]): VocationResult {
  const vector = {} as Record<Vocation, number>;
  VOCATIONS.forEach((voc, i) => {
    vector[voc] = scores[i] ?? 0;
  });

  // primary = argmax（displayOrder 先勝ち）
  let primary: Vocation = VOCATIONS[0]!;
  let primaryScore = vector[primary];
  for (const voc of VOCATIONS) {
    if (vector[voc] > primaryScore) {
      primary = voc;
      primaryScore = vector[voc];
    }
  }

  return { vector, primary, subs: [], totalAnswered: 100 };
}

describe("resolveTitle", () => {
  it("ベテラン（広×深）→ sage_hero（賢者/勇者, R3.2/3.6）", () => {
    // 5職掌が85 → breadth 5(>=4), depth 85(>=70)
    const result = resolveTitle(makeResult([85, 85, 85, 85, 85, 0, 0]));
    expect(result.breadth).toBe(5);
    expect(result.depth).toBe(85);
    expect(result.title).toBe("sage_hero");
  });

  it("スペシャリスト（狭×深）→ specialist（R3.3）", () => {
    // 2職掌が90、残りは60未満 → breadth 2(<4), depth 90(>=70)
    const result = resolveTitle(makeResult([90, 90, 50, 40, 30, 0, 0]));
    expect(result.breadth).toBe(2);
    expect(result.depth).toBe(90);
    expect(result.title).toBe("specialist");
  });

  it("遊撃/よろず屋（広×浅）→ jack_of_all（R3.5）", () => {
    // 4職掌が62..68 → breadth 4(>=4), depth<70
    const result = resolveTitle(makeResult([62, 64, 66, 68, 50, 0, 0]));
    expect(result.breadth).toBe(4);
    expect(result.depth).toBeLessThan(DEPTH_DEEP_MIN);
    expect(result.title).toBe("jack_of_all");
  });

  it("見習い（狭×浅）→ apprentice（R3.4）", () => {
    // 1職掌が62、残りは60未満 → breadth 1(<4), depth 62(<70)
    const result = resolveTitle(makeResult([62, 50, 40, 30, 20, 0, 0]));
    expect(result.breadth).toBe(1);
    expect(result.depth).toBe(62);
    expect(result.title).toBe("apprentice");
  });

  it("境界: breadth ちょうど 4(BREADTH_WIDE_MIN) かつ depth ちょうど 70 → sage_hero（R3.6）", () => {
    const result = resolveTitle(makeResult([70, 70, 70, 70, 50, 0, 0]));
    expect(result.breadth).toBe(BREADTH_WIDE_MIN);
    expect(result.depth).toBe(DEPTH_DEEP_MIN);
    expect(result.title).toBe("sage_hero");
  });

  it("境界: breadth 3(狭) かつ depth 70(深) → specialist", () => {
    const result = resolveTitle(makeResult([70, 70, 70, 50, 40, 0, 0]));
    expect(result.breadth).toBe(3);
    expect(result.depth).toBe(70);
    expect(result.title).toBe("specialist");
  });

  it("境界: breadth 4(広) かつ depth 69.99(浅) → jack_of_all", () => {
    // 平均が 69.99 になる4値: 69.98,69.99,70,70 → mean 69.9925 → round2 69.99
    const result = resolveTitle(makeResult([69.98, 69.99, 70, 70, 50, 0, 0]));
    expect(result.breadth).toBe(4);
    expect(result.depth).toBeLessThan(DEPTH_DEEP_MIN);
    expect(result.title).toBe("jack_of_all");
  });

  it("境界: ちょうど 60(BREADTH_ABS_THRESHOLD) は広さに数える / 59.99 は数えない", () => {
    // 60 は数える: 4職掌がちょうど60 → breadth 4
    const counted = resolveTitle(makeResult([60, 60, 60, 60, 59.99, 0, 0]));
    expect(counted.breadth).toBe(BREADTH_WIDE_MIN);
    expect(BREADTH_ABS_THRESHOLD).toBe(60);

    // 59.99 は数えない: 3職掌が60、1職掌が59.99 → breadth 3
    const notCounted = resolveTitle(makeResult([60, 60, 60, 59.99, 0, 0, 0]));
    expect(notCounted.breadth).toBe(3);
  });

  it("空/全ゼロベクトル → breadth 0, depth 0 → apprentice", () => {
    const result = resolveTitle(makeResult([0, 0, 0, 0, 0, 0, 0]));
    expect(result.breadth).toBe(0);
    expect(result.depth).toBe(0);
    expect(result.title).toBe("apprentice");
  });

  it("不変条件: breadth 0..7, depth 0..100, title は Title union", () => {
    const result = resolveTitle(makeResult([85, 85, 85, 85, 85, 85, 85]));
    expect(result.breadth).toBe(7);
    expect(result.breadth).toBeGreaterThanOrEqual(0);
    expect(result.breadth).toBeLessThanOrEqual(7);
    expect(result.depth).toBeGreaterThanOrEqual(0);
    expect(result.depth).toBeLessThanOrEqual(100);
    expect(["sage_hero", "specialist", "jack_of_all", "apprentice"]).toContain(
      result.title,
    );
  });

  it("決定論: 同一入力 → 同一出力", () => {
    const scores = [72, 68, 61, 90, 55, 60, 40];
    const a = resolveTitle(makeResult(scores));
    const b = resolveTitle(makeResult(scores));
    expect(a).toEqual(b);
  });
});

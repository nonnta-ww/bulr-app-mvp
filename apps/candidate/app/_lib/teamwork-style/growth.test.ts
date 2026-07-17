/**
 * growth.test.ts — 成長ディメンション（SJT→非評価アドバイス）のユニットテスト（R5.1〜R5.4）。
 */

import { describe, expect, it } from "vitest";

import { deriveGrowthAdvice, type GrowthAdvice } from "./growth";

/** 型安全に先頭要素を取り出す（noUncheckedIndexedAccess 対応）。 */
function first(advice: GrowthAdvice[]): GrowthAdvice {
  const head = advice[0];
  if (head === undefined) {
    throw new Error("expected non-empty advice");
  }
  return head;
}

describe("deriveGrowthAdvice", () => {
  it("回答なし → 空配列", () => {
    expect(deriveGrowthAdvice([])).toEqual([]);
  });

  it("回答のあるディメンションのみ返す（未回答は除外・R3.5）", () => {
    const advice = deriveGrowthAdvice([
      { dimension: "selfAwareness", level: 2 },
    ]);
    expect(advice).toHaveLength(1);
    expect(first(advice).dimension).toBe("selfAwareness");
    expect(first(advice).label).toBe("自己認識");
    expect(first(advice).advice.length).toBeGreaterThan(0);
  });

  it("段階写像: 平均 level が高い/低いで異なるアドバイスになる", () => {
    const low = deriveGrowthAdvice([{ dimension: "selfRegulation", level: 0 }]);
    const high = deriveGrowthAdvice([{ dimension: "selfRegulation", level: 2 }]);
    expect(first(low).advice).not.toBe(first(high).advice);
  });

  it("同一ディメンションの複数回答は平均で集約する", () => {
    const advice = deriveGrowthAdvice([
      { dimension: "perspectiveTaking", level: 2 },
      { dimension: "perspectiveTaking", level: 0 },
    ]);
    // 平均 1.0 → developing 段
    const developing = deriveGrowthAdvice([
      { dimension: "perspectiveTaking", level: 1 },
    ]);
    expect(first(advice).advice).toBe(first(developing).advice);
  });

  it("返却順は canonical order（自己認識→他者視点→感情の自己制御）", () => {
    const advice = deriveGrowthAdvice([
      { dimension: "selfRegulation", level: 1 },
      { dimension: "selfAwareness", level: 1 },
      { dimension: "perspectiveTaking", level: 1 },
    ]);
    expect(advice.map((a) => a.dimension)).toEqual([
      "selfAwareness",
      "perspectiveTaking",
      "selfRegulation",
    ]);
  });

  it("アドバイス文に数字（スコア・順位）を含めない（R5.3/R5.4）", () => {
    const advice = deriveGrowthAdvice([
      { dimension: "selfAwareness", level: 0 },
      { dimension: "perspectiveTaking", level: 1 },
      { dimension: "selfRegulation", level: 2 },
    ]);
    for (const a of advice) {
      expect(a.advice).not.toMatch(/[0-9]/);
    }
  });
});

/**
 * legacy.test.ts — 旧4型レコードの互換正規化（TDD）。
 *
 * design.md「Components > legacy.ts」／「Data Models > 永続化（read-time 非破壊正規化）」の契約を検証する:
 *  - 旧4型文字列（`${explorer|deepener}_${solo|collab}`）→ 2極のみ determined な partial summary
 *    （explorationDeepening / soloCollaboration のみ、planningImprovisation / stabilityChallenge は未含）。
 *  - 既に新 summary 形状ならそのまま返す（冪等）。
 *  - null → null。
 *  - 総関数：未知の文字列・不正なオブジェクトでも throw せず null（R7.3 旧データ描画保護）。
 */

import { describe, expect, it } from "vitest";

import type { LegacyTemperament, TemperamentSummary } from "@bulr/types";

import { normalizeClassResultTemperament } from "./legacy";

describe("normalizeClassResultTemperament", () => {
  const cases: Array<{
    legacy: LegacyTemperament;
    exploration: "explorer" | "deepener";
    social: "solo" | "collab";
  }> = [
    { legacy: "explorer_solo", exploration: "explorer", social: "solo" },
    { legacy: "explorer_collab", exploration: "explorer", social: "collab" },
    { legacy: "deepener_solo", exploration: "deepener", social: "solo" },
    { legacy: "deepener_collab", exploration: "deepener", social: "collab" },
  ];

  for (const { legacy, exploration, social } of cases) {
    it(`旧値 ${legacy} → 2極のみ partial summary`, () => {
      const result = normalizeClassResultTemperament(legacy);
      expect(result).not.toBeNull();
      // 決定されるのは explorationDeepening / soloCollaboration の2軸のみ。
      expect(result?.poles).toEqual({
        explorationDeepening: exploration,
        soloCollaboration: social,
      });
      // planningImprovisation / stabilityChallenge はキー自体を持たない。
      expect(Object.keys(result?.poles ?? {})).toHaveLength(2);
      expect(result?.balancedAxes).toEqual([]);
      expect(result?.code).toBeNull();
      expect(result?.completeness).toBe("partial");
    });
  }

  it("既に新 summary 形状（full, code あり）ならそのまま返す（冪等）", () => {
    const summary: TemperamentSummary = {
      poles: {
        explorationDeepening: "deepener",
        soloCollaboration: "collab",
        planningImprovisation: "improviser",
        stabilityChallenge: "challenger",
      },
      balancedAxes: [],
      code: "deepener-collab-improviser-challenger",
      completeness: "full",
    };
    expect(normalizeClassResultTemperament(summary)).toBe(summary);
  });

  it("partial な新 summary 形状もそのまま返す（冪等）", () => {
    const summary: TemperamentSummary = {
      poles: { explorationDeepening: "explorer" },
      balancedAxes: ["explorationDeepening"],
      code: null,
      completeness: "partial",
    };
    expect(normalizeClassResultTemperament(summary)).toBe(summary);
  });

  it("null → null", () => {
    expect(normalizeClassResultTemperament(null)).toBeNull();
  });

  it("未知の文字列 → null（throw しない）", () => {
    expect(() =>
      normalizeClassResultTemperament("garbage" as LegacyTemperament),
    ).not.toThrow();
    expect(
      normalizeClassResultTemperament("garbage" as LegacyTemperament),
    ).toBeNull();
  });

  it("不正なオブジェクト（completeness/poles を欠く）→ null（throw しない）", () => {
    const malformed = { foo: "bar" } as unknown as TemperamentSummary;
    expect(() => normalizeClassResultTemperament(malformed)).not.toThrow();
    expect(normalizeClassResultTemperament(malformed)).toBeNull();
  });
});

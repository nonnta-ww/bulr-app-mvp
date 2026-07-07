/**
 * assemble.ts のユニットテスト（純関数・決定論・R3.1/8.2/8.3/12.1）。
 *
 * 職掌(主/副/7ベクトル) × 気質(single|null) × 称号 を ClassResult へ組み立てる。
 * - vocationVector は常に7キー保持（R12.1）。
 * - temperament=null でも partial 結果として組み立て可能（R8.2）。
 * - totalAnswered < LOW_CONFIDENCE_MIN_ANSWERS で confidence='low'（R8.3）。
 */

import { describe, expect, it } from "vitest";

import type { Vocation } from "@bulr/types";

import { assembleClass } from "./assemble";
import {
  LOW_CONFIDENCE_MIN_ANSWERS,
  TEMPERAMENT_LABELS,
  VOCATION_LABELS,
  VOCATIONS,
} from "./definitions";
import type { TemperamentResult } from "./temperament";
import type { TitleResult } from "./title";
import type { VocationResult } from "./vocation";

/** VOCATIONS 順のスコア配列から VocationResult を組み立てる。 */
function makeVocation(
  scores: number[],
  opts?: { primary?: Vocation; subs?: Vocation[]; totalAnswered?: number },
): VocationResult {
  const vector = {} as Record<Vocation, number>;
  VOCATIONS.forEach((voc, i) => {
    vector[voc] = scores[i] ?? 0;
  });

  let primary: Vocation = VOCATIONS[0]!;
  let primaryScore = vector[primary];
  for (const voc of VOCATIONS) {
    if (vector[voc] > primaryScore) {
      primary = voc;
      primaryScore = vector[voc];
    }
  }

  return {
    vector,
    primary: opts?.primary ?? primary,
    subs: opts?.subs ?? [],
    totalAnswered: opts?.totalAnswered ?? 100,
  };
}

function makeTemperament(
  quadrant: TemperamentResult["quadrant"],
  balanced = false,
): TemperamentResult {
  return {
    axes: { explorationDeepening: 60, soloCollaboration: 60 },
    quadrant,
    balanced,
  };
}

const TITLE: TitleResult = { title: "specialist", breadth: 2, depth: 90 };

describe("assembleClass", () => {
  it("フル組み立て（R3.1）: 全フィールドが正しく className が非空", () => {
    const v = makeVocation([90, 80, 40, 30, 20, 10, 0], {
      subs: ["rearguard"],
      totalAnswered: 100,
    });
    const t = makeTemperament("deepener_solo");
    const result = assembleClass(v, t, TITLE);

    expect(result.primaryVocation).toBe("vanguard");
    expect(result.subVocations).toEqual(["rearguard"]);
    expect(result.vocationVector).toEqual(v.vector);
    expect(result.temperament).toBe("deepener_solo");
    expect(result.temperamentBalanced).toBe(false);
    expect(result.title).toBe("specialist");
    expect(result.representativeVocation).toBe("vanguard");
    expect(result.confidence).toBe("normal");
    expect(result.className.length).toBeGreaterThan(0);
    // 主職掌ラベルを必ず含む
    expect(result.className).toContain(VOCATION_LABELS.vanguard);
  });

  it("vocationVector は常に7キー（R12.1）: sage/strategist を含む全職掌", () => {
    const v = makeVocation([50, 40, 30, 20, 10, 5, 0]);
    const result = assembleClass(v, makeTemperament("explorer_collab"), TITLE);

    const keys = Object.keys(result.vocationVector).sort();
    expect(keys).toEqual([...VOCATIONS].sort());
    expect(keys).toContain("sage");
    expect(keys).toContain("strategist");
    expect(keys).toHaveLength(7);
  });

  it("temperament=null → partial（R8.2）: className は非空、他フィールドは維持", () => {
    const v = makeVocation([90, 80, 40, 30, 20, 10, 0], {
      subs: ["rearguard"],
    });
    const result = assembleClass(v, null, TITLE);

    expect(result.temperament).toBeNull();
    expect(result.temperamentBalanced).toBe(false);
    expect(result.className.length).toBeGreaterThan(0);
    expect(result.primaryVocation).toBe("vanguard");
    expect(result.subVocations).toEqual(["rearguard"]);
    expect(result.title).toBe("specialist");
    expect(result.representativeVocation).toBe("vanguard");
    // 主職掌ラベルは partial でも含む
    expect(result.className).toContain(VOCATION_LABELS.vanguard);
  });

  it("temperamentBalanced は t.balanced を反映", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const result = assembleClass(
      v,
      makeTemperament("deepener_collab", true),
      TITLE,
    );
    expect(result.temperamentBalanced).toBe(true);
  });

  it("confidence（R8.3）: totalAnswered < 8 → low", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0], { totalAnswered: 7 });
    const result = assembleClass(v, makeTemperament("explorer_solo"), TITLE);
    expect(result.confidence).toBe("low");
  });

  it("confidence（R8.3）: totalAnswered ちょうど 8(境界) → normal", () => {
    expect(LOW_CONFIDENCE_MIN_ANSWERS).toBe(8);
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0], {
      totalAnswered: LOW_CONFIDENCE_MIN_ANSWERS,
    });
    const result = assembleClass(v, makeTemperament("explorer_solo"), TITLE);
    expect(result.confidence).toBe("normal");
  });

  it("confidence（R8.3）: totalAnswered > 8 → normal", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0], { totalAnswered: 20 });
    const result = assembleClass(v, makeTemperament("explorer_solo"), TITLE);
    expect(result.confidence).toBe("normal");
  });

  it("representativeVocation === primary（R10 代表職掌）", () => {
    const v = makeVocation([10, 90, 30, 0, 0, 0, 0], { primary: "rearguard" });
    const result = assembleClass(v, makeTemperament("deepener_solo"), TITLE);
    expect(result.representativeVocation).toBe(result.primaryVocation);
    expect(result.representativeVocation).toBe("rearguard");
  });

  it("className は気質で変化: 同一 v+title・異なる2気質 → 異なる className", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const a = assembleClass(v, makeTemperament("explorer_solo"), TITLE);
    const b = assembleClass(v, makeTemperament("deepener_collab"), TITLE);
    expect(a.className).not.toBe(b.className);
    // どちらも気質ラベルを含む
    expect(a.className).toContain(TEMPERAMENT_LABELS.explorer_solo);
    expect(b.className).toContain(TEMPERAMENT_LABELS.deepener_collab);
  });

  it("className: null 気質は両気質版と異なるが有効な非空", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const a = assembleClass(v, makeTemperament("explorer_solo"), TITLE);
    const b = assembleClass(v, makeTemperament("deepener_collab"), TITLE);
    const nullish = assembleClass(v, null, TITLE);

    expect(nullish.className.length).toBeGreaterThan(0);
    expect(nullish.className).not.toBe(a.className);
    expect(nullish.className).not.toBe(b.className);
    // null 版は気質ラベルを一切含まない
    expect(nullish.className).not.toContain(TEMPERAMENT_LABELS.explorer_solo);
    expect(nullish.className).not.toContain(TEMPERAMENT_LABELS.deepener_collab);
  });

  it("不変条件: 全フィールド populated かつ confidence は union", () => {
    const v = makeVocation([80, 70, 60, 50, 40, 30, 20], {
      subs: ["rearguard", "guardian"],
    });
    const result = assembleClass(v, makeTemperament("deepener_collab"), TITLE);

    expect(result.primaryVocation).toBeTruthy();
    expect(Array.isArray(result.subVocations)).toBe(true);
    expect(Object.keys(result.vocationVector)).toHaveLength(7);
    expect(result.title).toBeTruthy();
    expect(result.representativeVocation).toBeTruthy();
    expect(result.className.length).toBeGreaterThan(0);
    expect(["low", "normal"]).toContain(result.confidence);
  });

  it("決定論: 同一入力を2回 → deep-equal", () => {
    const v = makeVocation([72, 68, 61, 90, 55, 60, 40], {
      subs: ["vanguard"],
      totalAnswered: 42,
    });
    const t = makeTemperament("deepener_solo");
    const a = assembleClass(v, t, TITLE);
    const b = assembleClass(v, t, TITLE);
    expect(a).toEqual(b);
  });
});

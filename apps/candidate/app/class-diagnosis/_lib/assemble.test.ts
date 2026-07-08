/**
 * assemble.ts のユニットテスト（純関数・決定論・R3.1/7.2/8.2/8.3/12.1）。
 *
 * 職掌(主/副/7ベクトル) × 気質(TemperamentProfile|null) × 称号 を ClassResult へ組み立てる。
 * - vocationVector は常に7キー保持（R12.1）。
 * - 気質 null / completeness==='none' でも partial 結果として組み立て可能（R8.2）。
 * - className: full のみ archetype shortLabel を埋め込み、partial/none/null は気質省略（R7.2）。
 * - ClassResult.temperament は TemperamentSummary | null（`temperamentBalanced` は廃止）。
 * - totalAnswered < LOW_CONFIDENCE_MIN_ANSWERS で confidence='low'（R8.3）。
 */

import { describe, expect, it } from "vitest";

import type {
  TemperamentAxis,
  TemperamentPole,
  Vocation,
} from "@bulr/types";

import { AXES, AXIS_POLES } from "../../_lib/temperament/axes";
import { TEMPERAMENT_ARCHETYPES } from "../../_lib/temperament/archetypes";
import { deriveCode, type TemperamentProfile } from "../../_lib/temperament/score";
import { assembleClass } from "./assemble";
import {
  LOW_CONFIDENCE_MIN_ANSWERS,
  VOCATION_LABELS,
  VOCATIONS,
} from "./definitions";
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

/**
 * 各軸に「low(第1極) or high(第2極)」を指定して full な TemperamentProfile を組む。
 * 全4軸 determined → completeness='full'・code 確定。
 */
function makeFullProfile(
  choose: Record<TemperamentAxis, "low" | "high">,
): TemperamentProfile {
  const axes = {} as TemperamentProfile["axes"];
  const poles = {} as Record<TemperamentAxis, TemperamentPole>;
  for (const axis of AXES) {
    const pole = AXIS_POLES[axis][choose[axis]];
    poles[axis] = pole;
    axes[axis] = {
      score: choose[axis] === "high" ? 75 : 25,
      pole,
      determined: true,
      balanced: false,
    };
  }
  return { axes, completeness: "full", code: deriveCode(poles) };
}

/** 探索軸のみ determined の partial な TemperamentProfile を組む（他3軸は未回答）。 */
function makePartialProfile(): TemperamentProfile {
  const axes = {} as TemperamentProfile["axes"];
  for (const axis of AXES) {
    const determined = axis === "explorationDeepening";
    axes[axis] = {
      score: determined ? 75 : 50,
      pole: determined ? AXIS_POLES[axis].high : AXIS_POLES[axis].low,
      determined,
      balanced: false,
    };
  }
  return { axes, completeness: "partial", code: null };
}

/** 全4軸未回答の none な TemperamentProfile を組む。 */
function makeNoneProfile(): TemperamentProfile {
  const axes = {} as TemperamentProfile["axes"];
  for (const axis of AXES) {
    axes[axis] = {
      score: 50,
      pole: AXIS_POLES[axis].low,
      determined: false,
      balanced: false,
    };
  }
  return { axes, completeness: "none", code: null };
}

const ALL_HIGH: Record<TemperamentAxis, "low" | "high"> = {
  explorationDeepening: "high",
  soloCollaboration: "high",
  planningImprovisation: "high",
  stabilityChallenge: "high",
};
const ALL_LOW: Record<TemperamentAxis, "low" | "high"> = {
  explorationDeepening: "low",
  soloCollaboration: "low",
  planningImprovisation: "low",
  stabilityChallenge: "low",
};

const TITLE: TitleResult = { title: "specialist", breadth: 2, depth: 90 };

describe("assembleClass", () => {
  it("フル組み立て（R3.1/R7.2）: temperament は summary、className に archetype shortLabel", () => {
    const v = makeVocation([90, 80, 40, 30, 20, 10, 0], {
      subs: ["rearguard"],
      totalAnswered: 100,
    });
    const profile = makeFullProfile(ALL_LOW);
    const result = assembleClass(v, profile, TITLE);

    expect(result.primaryVocation).toBe("vanguard");
    expect(result.subVocations).toEqual(["rearguard"]);
    expect(result.vocationVector).toEqual(v.vector);
    // temperament は TemperamentSummary（quadrant 文字列ではない）
    expect(result.temperament).not.toBeNull();
    expect(result.temperament!.completeness).toBe("full");
    expect(result.temperament!.code).toBe(profile.code);
    expect(result.title).toBe("specialist");
    expect(result.representativeVocation).toBe("vanguard");
    expect(result.confidence).toBe("normal");
    expect(result.className.length).toBeGreaterThan(0);
    // 主職掌ラベルを必ず含む
    expect(result.className).toContain(VOCATION_LABELS.vanguard);
    // full → archetype shortLabel を埋め込む
    const shortLabel = TEMPERAMENT_ARCHETYPES[profile.code!].shortLabel;
    expect(result.className).toContain(shortLabel);
    expect(result.className).toBe(
      `${"スペシャリスト"}・${shortLabel}な${VOCATION_LABELS.vanguard}`,
    );
  });

  it("vocationVector は常に7キー（R12.1）: sage/strategist を含む全職掌", () => {
    const v = makeVocation([50, 40, 30, 20, 10, 5, 0]);
    const result = assembleClass(v, makeFullProfile(ALL_HIGH), TITLE);

    const keys = Object.keys(result.vocationVector).sort();
    expect(keys).toEqual([...VOCATIONS].sort());
    expect(keys).toContain("sage");
    expect(keys).toContain("strategist");
    expect(keys).toHaveLength(7);
  });

  it("temperament=null → partial（R8.2）: className は非空で気質省略、他フィールドは維持", () => {
    const v = makeVocation([90, 80, 40, 30, 20, 10, 0], {
      subs: ["rearguard"],
    });
    const result = assembleClass(v, null, TITLE);

    expect(result.temperament).toBeNull();
    expect(result.className.length).toBeGreaterThan(0);
    // 気質省略形: 称号・職掌
    expect(result.className).toBe(`スペシャリスト・${VOCATION_LABELS.vanguard}`);
    expect(result.primaryVocation).toBe("vanguard");
    expect(result.subVocations).toEqual(["rearguard"]);
    expect(result.title).toBe("specialist");
    expect(result.representativeVocation).toBe("vanguard");
    // 主職掌ラベルは partial でも含む
    expect(result.className).toContain(VOCATION_LABELS.vanguard);
  });

  it("completeness==='none' の profile → temperament=null 扱い（R8.2）", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const result = assembleClass(v, makeNoneProfile(), TITLE);
    expect(result.temperament).toBeNull();
    expect(result.className).toBe(`スペシャリスト・${VOCATION_LABELS.vanguard}`);
  });

  it("partial profile → summary は付くが className は気質省略（R7.2）", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const profile = makePartialProfile();
    const result = assembleClass(v, profile, TITLE);
    // summary 自体は付く（determined 軸の極を保持）
    expect(result.temperament).not.toBeNull();
    expect(result.temperament!.completeness).toBe("partial");
    expect(result.temperament!.code).toBeNull();
    expect(result.temperament!.poles.explorationDeepening).toBe(
      AXIS_POLES.explorationDeepening.high,
    );
    // className は full でないため気質を省略する
    expect(result.className).toBe(`スペシャリスト・${VOCATION_LABELS.vanguard}`);
  });

  it("summary.balancedAxes は determined かつ balanced な軸を反映", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    // exploration 軸を balanced（中点）にした full profile を組む
    const profile = makeFullProfile(ALL_HIGH);
    profile.axes.explorationDeepening.balanced = true;
    const result = assembleClass(v, profile, TITLE);
    expect(result.temperament!.balancedAxes).toContain("explorationDeepening");
  });

  it("confidence（R8.3）: totalAnswered < 8 → low", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0], { totalAnswered: 7 });
    const result = assembleClass(v, makeFullProfile(ALL_LOW), TITLE);
    expect(result.confidence).toBe("low");
  });

  it("confidence（R8.3）: totalAnswered ちょうど 8(境界) → normal", () => {
    expect(LOW_CONFIDENCE_MIN_ANSWERS).toBe(8);
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0], {
      totalAnswered: LOW_CONFIDENCE_MIN_ANSWERS,
    });
    const result = assembleClass(v, makeFullProfile(ALL_LOW), TITLE);
    expect(result.confidence).toBe("normal");
  });

  it("confidence（R8.3）: totalAnswered > 8 → normal", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0], { totalAnswered: 20 });
    const result = assembleClass(v, makeFullProfile(ALL_LOW), TITLE);
    expect(result.confidence).toBe("normal");
  });

  it("representativeVocation === primary（R10 代表職掌）", () => {
    const v = makeVocation([10, 90, 30, 0, 0, 0, 0], { primary: "rearguard" });
    const result = assembleClass(v, makeFullProfile(ALL_LOW), TITLE);
    expect(result.representativeVocation).toBe(result.primaryVocation);
    expect(result.representativeVocation).toBe("rearguard");
  });

  it("className は気質で変化: 同一 v+title・異なる2つの full 気質 → 異なる className（R7.2）", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const a = assembleClass(v, makeFullProfile(ALL_LOW), TITLE);
    const b = assembleClass(v, makeFullProfile(ALL_HIGH), TITLE);
    expect(a.className).not.toBe(b.className);
    // どちらも対応する archetype shortLabel を含む
    const aShort = TEMPERAMENT_ARCHETYPES[deriveCode(polesFrom(ALL_LOW))].shortLabel;
    const bShort = TEMPERAMENT_ARCHETYPES[deriveCode(polesFrom(ALL_HIGH))].shortLabel;
    expect(a.className).toContain(aShort);
    expect(b.className).toContain(bShort);
  });

  it("className: null 気質は full 版と異なり、archetype shortLabel を一切含まない（R7.2）", () => {
    const v = makeVocation([90, 0, 0, 0, 0, 0, 0]);
    const a = assembleClass(v, makeFullProfile(ALL_LOW), TITLE);
    const b = assembleClass(v, makeFullProfile(ALL_HIGH), TITLE);
    const nullish = assembleClass(v, null, TITLE);

    expect(nullish.className.length).toBeGreaterThan(0);
    expect(nullish.className).not.toBe(a.className);
    expect(nullish.className).not.toBe(b.className);
    const aShort = TEMPERAMENT_ARCHETYPES[deriveCode(polesFrom(ALL_LOW))].shortLabel;
    const bShort = TEMPERAMENT_ARCHETYPES[deriveCode(polesFrom(ALL_HIGH))].shortLabel;
    expect(nullish.className).not.toContain(aShort);
    expect(nullish.className).not.toContain(bShort);
  });

  it("不変条件: 全フィールド populated かつ confidence は union", () => {
    const v = makeVocation([80, 70, 60, 50, 40, 30, 20], {
      subs: ["rearguard", "guardian"],
    });
    const result = assembleClass(v, makeFullProfile(ALL_HIGH), TITLE);

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
    const profile = makeFullProfile(ALL_LOW);
    const a = assembleClass(v, profile, TITLE);
    const b = assembleClass(v, profile, TITLE);
    expect(a).toEqual(b);
  });
});

/** choose(low/high) 指定から canonical order の極マップを組む（code 期待値のため）。 */
function polesFrom(
  choose: Record<TemperamentAxis, "low" | "high">,
): Record<TemperamentAxis, TemperamentPole> {
  const poles = {} as Record<TemperamentAxis, TemperamentPole>;
  for (const axis of AXES) {
    poles[axis] = AXIS_POLES[axis][choose[axis]];
  }
  return poles;
}

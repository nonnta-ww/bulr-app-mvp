/**
 * score.test.ts — 気質スコアリング純関数（partial 対応）のユニットテスト。
 *
 * design.md「Components > score.ts」の契約を TDD で検証する:
 *  - post-reverse 正規化平均（0..100, 2桁丸め）
 *  - determined = その軸に >=1 回答があること（未回答軸は中点埋めするが determined=false）
 *  - 極: score > midpoint → 第2極 / <= midpoint → 第1極（既定極）、midpoint ちょうどで balanced
 *  - completeness: 0→none / 4→full / それ以外→partial
 *  - code: full のときのみ非null（deriveCode, canonical order）。INVARIANT: code 非null ⇔ full
 *  - toSummary: determined 軸のみ poles、balanced 軸の列挙、code/completeness の射影
 *  - 決定論: 同一入力→同一出力
 *
 * すべて純関数のみ（DB/LLM/Date/乱数に非依存）。
 */

import { describe, expect, it } from "vitest";

import type { TemperamentAxis } from "@bulr/types";

import { AXES, TEMPERAMENT_MIDPOINT } from "./axes";
import {
  deriveCode,
  scoreTemperament,
  toSummary,
  type TemperamentAnswer,
} from "./score";

/** level=maxLevel（=100% 寄り＝第2極 high）の回答を1問作る。 */
function high(axis: TemperamentAxis): TemperamentAnswer {
  return { axis, level: 4, reverse: false, maxLevel: 4 };
}

/** level=0（=0% 寄り＝第1極 low）の回答を1問作る。 */
function low(axis: TemperamentAxis): TemperamentAnswer {
  return { axis, level: 0, reverse: false, maxLevel: 4 };
}

describe("scoreTemperament", () => {
  it("(a) 空配列 → completeness 'none'、code null、4軸すべて determined=false", () => {
    const profile = scoreTemperament([]);

    expect(profile.completeness).toBe("none");
    expect(profile.code).toBeNull();
    expect(Object.keys(profile.axes).sort()).toEqual([...AXES].sort());
    for (const axis of AXES) {
      expect(profile.axes[axis].determined).toBe(false);
      // 未回答軸は中点で埋める（キー完備のため）が determined=false
      expect(profile.axes[axis].score).toBe(TEMPERAMENT_MIDPOINT);
    }

    const summary = toSummary(profile);
    expect(summary.poles).toEqual({});
    expect(summary.balancedAxes).toEqual([]);
    expect(summary.code).toBeNull();
    expect(summary.completeness).toBe("none");
  });

  it("(b) 2軸のみ回答 → その2軸 determined、残り2軸 undetermined、partial、code null", () => {
    const profile = scoreTemperament([
      high("explorationDeepening"),
      low("soloCollaboration"),
    ]);

    expect(profile.completeness).toBe("partial");
    expect(profile.code).toBeNull();

    expect(profile.axes.explorationDeepening.determined).toBe(true);
    expect(profile.axes.explorationDeepening.pole).toBe("deepener"); // high
    expect(profile.axes.soloCollaboration.determined).toBe(true);
    expect(profile.axes.soloCollaboration.pole).toBe("solo"); // low(default)

    expect(profile.axes.planningImprovisation.determined).toBe(false);
    expect(profile.axes.stabilityChallenge.determined).toBe(false);

    const summary = toSummary(profile);
    // poles は determined な2軸ちょうど
    expect(Object.keys(summary.poles).sort()).toEqual(
      ["explorationDeepening", "soloCollaboration"].sort(),
    );
    expect(summary.poles.explorationDeepening).toBe("deepener");
    expect(summary.poles.soloCollaboration).toBe("solo");
    expect(summary.code).toBeNull();
    expect(summary.completeness).toBe("partial");
  });

  it("(c) 4軸すべて回答（明確な寄り）→ full、code は期待の16型、summary.poles は4軸", () => {
    const profile = scoreTemperament([
      low("explorationDeepening"), // → explorer
      high("soloCollaboration"), // → collab
      low("planningImprovisation"), // → planner
      high("stabilityChallenge"), // → challenger
    ]);

    expect(profile.completeness).toBe("full");
    expect(profile.axes.explorationDeepening.pole).toBe("explorer");
    expect(profile.axes.soloCollaboration.pole).toBe("collab");
    expect(profile.axes.planningImprovisation.pole).toBe("planner");
    expect(profile.axes.stabilityChallenge.pole).toBe("challenger");
    expect(profile.code).toBe("explorer-collab-planner-challenger");

    const summary = toSummary(profile);
    expect(Object.keys(summary.poles).sort()).toEqual([...AXES].sort());
    expect(summary.code).toBe("explorer-collab-planner-challenger");
    expect(summary.completeness).toBe("full");
    // INVARIANT: code 非null ⇔ full
    expect(summary.code).not.toBeNull();
  });

  it("(d) 中点ちょうど（level=2,maxLevel=4）→ balanced=true、pole=第1極（既定極）", () => {
    const profile = scoreTemperament([
      { axis: "explorationDeepening", level: 2, reverse: false, maxLevel: 4 },
    ]);

    const reading = profile.axes.explorationDeepening;
    expect(reading.score).toBe(TEMPERAMENT_MIDPOINT);
    expect(reading.balanced).toBe(true);
    expect(reading.pole).toBe("explorer"); // 既定極（low）
    expect(reading.determined).toBe(true);

    // toSummary: balanced 軸に列挙される
    const summary = toSummary(profile);
    expect(summary.balancedAxes).toEqual(["explorationDeepening"]);
    expect(summary.poles.explorationDeepening).toBe("explorer");
  });

  it("(e) reverse 吸収: reverse=true は level を反転（level=4 reverse → effective 0 → 第1極）", () => {
    const profile = scoreTemperament([
      { axis: "explorationDeepening", level: 4, reverse: true, maxLevel: 4 },
    ]);

    const reading = profile.axes.explorationDeepening;
    // effective = 4-4 = 0 → normalized 0 → low pole
    expect(reading.score).toBe(0);
    expect(reading.pole).toBe("explorer");
    expect(reading.balanced).toBe(false);
  });

  it("(f) 決定論: 同一入力を2回 → deep equal", () => {
    const answers: TemperamentAnswer[] = [
      high("explorationDeepening"),
      low("soloCollaboration"),
      high("planningImprovisation"),
    ];
    const first = scoreTemperament(answers);
    const second = scoreTemperament(answers);
    expect(first).toEqual(second);
  });

  it("軸スコアは同一軸の複数回答の平均（2桁丸め）", () => {
    // high(100) と low(0) の平均 → 50（midpoint, balanced）
    const profile = scoreTemperament([
      high("explorationDeepening"),
      low("explorationDeepening"),
    ]);
    expect(profile.axes.explorationDeepening.score).toBe(50);
    expect(profile.axes.explorationDeepening.balanced).toBe(true);

    // 100 と 100/3(=33.33) の平均 → 66.67（2桁丸め）
    const profile2 = scoreTemperament([
      { axis: "soloCollaboration", level: 4, reverse: false, maxLevel: 4 },
      { axis: "soloCollaboration", level: 1, reverse: false, maxLevel: 3 },
    ]);
    // (100 + 33.33...) / 2 = 66.666... → 66.67
    expect(profile2.axes.soloCollaboration.score).toBe(66.67);
  });
});

describe("deriveCode", () => {
  it("canonical order の極を '-' 連結する", () => {
    const code = deriveCode({
      explorationDeepening: "explorer",
      soloCollaboration: "solo",
      planningImprovisation: "planner",
      stabilityChallenge: "stabilizer",
    });
    expect(code).toBe("explorer-solo-planner-stabilizer");
  });

  it("軸の順序に依らず AXES canonical order で連結する（決定論）", () => {
    const code = deriveCode({
      stabilityChallenge: "challenger",
      planningImprovisation: "improviser",
      soloCollaboration: "collab",
      explorationDeepening: "deepener",
    });
    expect(code).toBe("deepener-collab-improviser-challenger");
  });
});

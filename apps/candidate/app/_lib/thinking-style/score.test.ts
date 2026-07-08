/**
 * score.test.ts — 思考スタイルスコアリング純関数（partial 対応）のユニットテスト。
 *
 * design.md「app core > スコアリング（score.ts）」の契約を TDD で検証する:
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

import { AXES, THINKING_STYLE_MIDPOINT, type ThinkingStyleAxis } from "./axes";
import {
  deriveCode,
  scoreThinkingStyle,
  toSummary,
  type ThinkingStyleAnswer,
} from "./score";

/** level=maxLevel（=100% 寄り＝第2極 high）の回答を1問作る。 */
function high(axis: ThinkingStyleAxis): ThinkingStyleAnswer {
  return { axis, level: 4, reverse: false, maxLevel: 4 };
}

/** level=0（=0% 寄り＝第1極 low）の回答を1問作る。 */
function low(axis: ThinkingStyleAxis): ThinkingStyleAnswer {
  return { axis, level: 0, reverse: false, maxLevel: 4 };
}

describe("scoreThinkingStyle", () => {
  it("(a) 空配列 → completeness 'none'、code null、4軸すべて determined=false", () => {
    const profile = scoreThinkingStyle([]);

    expect(profile.completeness).toBe("none");
    expect(profile.code).toBeNull();
    expect(Object.keys(profile.axes).sort()).toEqual([...AXES].sort());
    for (const axis of AXES) {
      expect(profile.axes[axis].determined).toBe(false);
      // 未回答軸は中点で埋める（キー完備のため）が determined=false
      expect(profile.axes[axis].score).toBe(THINKING_STYLE_MIDPOINT);
    }

    const summary = toSummary(profile);
    expect(summary.poles).toEqual({});
    expect(summary.balancedAxes).toEqual([]);
    expect(summary.code).toBeNull();
    expect(summary.completeness).toBe("none");
  });

  it("(b) 2軸のみ回答 → その2軸 determined、残り2軸 undetermined、partial、code null", () => {
    const profile = scoreThinkingStyle([
      high("abstractConcrete"),
      low("logicIntuition"),
    ]);

    expect(profile.completeness).toBe("partial");
    expect(profile.code).toBeNull();

    expect(profile.axes.abstractConcrete.determined).toBe(true);
    expect(profile.axes.abstractConcrete.pole).toBe("concrete"); // high
    expect(profile.axes.logicIntuition.determined).toBe(true);
    expect(profile.axes.logicIntuition.pole).toBe("logic"); // low(default)

    expect(profile.axes.convergentDivergent.determined).toBe(false);
    expect(profile.axes.theoryPractice.determined).toBe(false);

    const summary = toSummary(profile);
    // poles は determined な2軸ちょうど
    expect(Object.keys(summary.poles).sort()).toEqual(
      ["abstractConcrete", "logicIntuition"].sort(),
    );
    expect(summary.poles.abstractConcrete).toBe("concrete");
    expect(summary.poles.logicIntuition).toBe("logic");
    expect(summary.code).toBeNull();
    expect(summary.completeness).toBe("partial");
  });

  it("(b2) 3軸回答 → partial、code null（1–3軸は常に partial）", () => {
    const profile = scoreThinkingStyle([
      high("abstractConcrete"),
      low("logicIntuition"),
      high("convergentDivergent"),
    ]);

    expect(profile.completeness).toBe("partial");
    expect(profile.code).toBeNull();
    expect(profile.axes.theoryPractice.determined).toBe(false);
  });

  it("(c) 4軸すべて回答（明確な寄り）→ full、code は期待の16型、summary.poles は4軸", () => {
    const profile = scoreThinkingStyle([
      low("abstractConcrete"), // → abstract
      high("logicIntuition"), // → intuition
      low("convergentDivergent"), // → convergent
      high("theoryPractice"), // → practice
    ]);

    expect(profile.completeness).toBe("full");
    expect(profile.axes.abstractConcrete.pole).toBe("abstract");
    expect(profile.axes.logicIntuition.pole).toBe("intuition");
    expect(profile.axes.convergentDivergent.pole).toBe("convergent");
    expect(profile.axes.theoryPractice.pole).toBe("practice");
    expect(profile.code).toBe("abstract-intuition-convergent-practice");

    const summary = toSummary(profile);
    expect(Object.keys(summary.poles).sort()).toEqual([...AXES].sort());
    expect(summary.code).toBe("abstract-intuition-convergent-practice");
    expect(summary.completeness).toBe("full");
    // INVARIANT: code 非null ⇔ full
    expect(summary.code).not.toBeNull();
  });

  it("(d) 中点ちょうど（level=2,maxLevel=4）→ balanced=true、pole=第1極（既定極）", () => {
    const profile = scoreThinkingStyle([
      { axis: "abstractConcrete", level: 2, reverse: false, maxLevel: 4 },
    ]);

    const reading = profile.axes.abstractConcrete;
    expect(reading.score).toBe(THINKING_STYLE_MIDPOINT);
    expect(reading.balanced).toBe(true);
    expect(reading.pole).toBe("abstract"); // 既定極（low）
    expect(reading.determined).toBe(true);

    // toSummary: balanced 軸に列挙される
    const summary = toSummary(profile);
    expect(summary.balancedAxes).toEqual(["abstractConcrete"]);
    expect(summary.poles.abstractConcrete).toBe("abstract");
  });

  it("(e) reverse 吸収: reverse=true は level を反転（level=4 reverse → effective 0 → 第1極）", () => {
    const profile = scoreThinkingStyle([
      { axis: "abstractConcrete", level: 4, reverse: true, maxLevel: 4 },
    ]);

    const reading = profile.axes.abstractConcrete;
    // effective = 4-4 = 0 → normalized 0 → low pole
    expect(reading.score).toBe(0);
    expect(reading.pole).toBe("abstract");
    expect(reading.balanced).toBe(false);
  });

  it("(f) 決定論: 同一入力を2回 → deep equal", () => {
    const answers: ThinkingStyleAnswer[] = [
      high("abstractConcrete"),
      low("logicIntuition"),
      high("convergentDivergent"),
    ];
    const first = scoreThinkingStyle(answers);
    const second = scoreThinkingStyle(answers);
    expect(first).toEqual(second);
  });

  it("軸スコアは同一軸の複数回答の平均（2桁丸め）", () => {
    // high(100) と low(0) の平均 → 50（midpoint, balanced）
    const profile = scoreThinkingStyle([
      high("abstractConcrete"),
      low("abstractConcrete"),
    ]);
    expect(profile.axes.abstractConcrete.score).toBe(50);
    expect(profile.axes.abstractConcrete.balanced).toBe(true);

    // 100 と 100/3(=33.33) の平均 → 66.67（2桁丸め）
    const profile2 = scoreThinkingStyle([
      { axis: "logicIntuition", level: 4, reverse: false, maxLevel: 4 },
      { axis: "logicIntuition", level: 1, reverse: false, maxLevel: 3 },
    ]);
    // (100 + 33.33...) / 2 = 66.666... → 66.67
    expect(profile2.axes.logicIntuition.score).toBe(66.67);
  });
});

describe("deriveCode", () => {
  it("canonical order の極を '-' 連結する", () => {
    const code = deriveCode({
      abstractConcrete: "abstract",
      logicIntuition: "logic",
      convergentDivergent: "convergent",
      theoryPractice: "theory",
    });
    expect(code).toBe("abstract-logic-convergent-theory");
  });

  it("軸の順序に依らず AXES canonical order で連結する（決定論）", () => {
    const code = deriveCode({
      theoryPractice: "practice",
      convergentDivergent: "divergent",
      logicIntuition: "intuition",
      abstractConcrete: "concrete",
    });
    expect(code).toBe("concrete-intuition-divergent-practice");
  });
});

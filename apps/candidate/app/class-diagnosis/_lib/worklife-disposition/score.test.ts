import { describe, it, expect } from "vitest";

import { scoreWorklifeDispositions } from "./score";
import type { WorklifeDispositionAnswer } from "./answers";

function ans(
  disposition: WorklifeDispositionAnswer["disposition"],
  level: number,
  maxLevel = 4,
): WorklifeDispositionAnswer {
  return { disposition, level, maxLevel };
}

describe("scoreWorklifeDispositions", () => {
  it("空配列（未回答）は {} を返す (R2.4/4.1)", () => {
    expect(scoreWorklifeDispositions([])).toEqual({});
  });

  it("level=4（満点）は 100、level=0 は 0 にクランプ／換算される (R2.5)", () => {
    expect(scoreWorklifeDispositions([ans("improvement", 4)])).toEqual({
      improvement: 100,
    });
    expect(scoreWorklifeDispositions([ans("incident", 0)])).toEqual({
      incident: 0,
    });
  });

  it("同一 disposition の複数回答は平均を取る (R2.1)", () => {
    // (0/4 + 4/4)*100 / 2 = 50
    const scores = scoreWorklifeDispositions([
      ans("mentoring", 0),
      ans("mentoring", 4),
    ]);
    expect(scores).toEqual({ mentoring: 50 });
  });

  it("中間 level は 25 刻みで換算される（level=2 → 50, level=3 → 75）", () => {
    expect(scoreWorklifeDispositions([ans("newTech", 2)])).toEqual({
      newTech: 50,
    });
    expect(scoreWorklifeDispositions([ans("coordination", 3)])).toEqual({
      coordination: 75,
    });
  });

  it("回答の無い DispositionKey はキー自体を省略する (R2.3)", () => {
    const scores = scoreWorklifeDispositions([ans("improvement", 4)]);
    expect(scores).toEqual({ improvement: 100 });
    expect("incident" in scores).toBe(false);
    expect("mentoring" in scores).toBe(false);
    expect(Object.keys(scores)).toEqual(["improvement"]);
  });

  it("すべての値は 0..100 に収まる (R2.5)", () => {
    const scores = scoreWorklifeDispositions([
      ans("improvement", 1),
      ans("incident", 2),
      ans("mentoring", 3),
      ans("coordination", 4),
      ans("newTech", 0),
    ]);
    for (const v of Object.values(scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("同一入力を2回渡すと同一結果を返す（決定論, R2.2）", () => {
    const input = [ans("improvement", 3), ans("improvement", 1), ans("newTech", 4)];
    const a = scoreWorklifeDispositions(input);
    const b = scoreWorklifeDispositions(input);
    expect(a).toEqual(b);
    // (3/4 + 1/4)*100 / 2 = 50
    expect(a).toEqual({ improvement: 50, newTech: 100 });
  });

  it("maxLevel<=0（不正）の回答は寄与させない（防御的）", () => {
    expect(scoreWorklifeDispositions([ans("improvement", 2, 0)])).toEqual({});
  });
});

/**
 * temperament.ts — 気質2軸スコアと象限化（純関数）の単体テスト。
 *
 * 決定論的ロジックの振る舞いを RED→GREEN で規定する。要件 2.3–2.6 / 8.2 をカバー。
 * DB/LLM に触れず、入力→出力の等価性・不変条件のみを検証する。
 *
 * ## ポール向き契約（seed task 5 との取り決め）
 * post-reverse の正規化スコアが高いほど「深化(deepener)」「協調(collab)」を意味する。
 * つまり playstyle seed は、逆転フラグ込みで高 level が deepening/collaboration を指すよう設問を作ること。
 */

import { describe, expect, it } from "vitest";

import type { TemperamentAxis } from "@bulr/types";

import { TEMPERAMENT_MIDPOINT } from "./definitions";
import { scoreTemperament, type TemperamentAnswer } from "./temperament";

/** answer を組み立てるヘルパ。 */
function ans(
  axis: TemperamentAxis,
  level: number,
  reverse = false,
  maxLevel = 4,
): TemperamentAnswer {
  return { axis, level, reverse, maxLevel };
}

describe("scoreTemperament", () => {
  describe("未回答 (R2.6/R8.2)", () => {
    it("空配列は null を返す", () => {
      expect(scoreTemperament([])).toBeNull();
    });
  });

  describe("逆転設問の吸収 (R2.3)", () => {
    it("reverse=true で level=maxLevel は effective 0（低ポール explorer/solo へ引く）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 4, true, 4),
        ans("soloCollaboration", 4, true, 4),
      ]);
      expect(result).not.toBeNull();
      expect(result!.axes.explorationDeepening).toBe(0);
      expect(result!.axes.soloCollaboration).toBe(0);
      expect(result!.quadrant).toBe("explorer_solo");
    });

    it("reverse=false で level=maxLevel は 100（高ポール deepener/collab へ引く）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 4, false, 4),
        ans("soloCollaboration", 4, false, 4),
      ]);
      expect(result!.axes.explorationDeepening).toBe(100);
      expect(result!.axes.soloCollaboration).toBe(100);
      expect(result!.quadrant).toBe("deepener_collab");
    });

    it("同一軸の reverse と非 reverse は打ち消し合って中点付近になる", () => {
      // level=maxLevel non-reverse=100, level=maxLevel reverse=0 → 平均 50
      const result = scoreTemperament([
        ans("explorationDeepening", 4, false, 4),
        ans("explorationDeepening", 4, true, 4),
        ans("soloCollaboration", 2, false, 4),
      ]);
      expect(result!.axes.explorationDeepening).toBe(50);
    });
  });

  describe("4象限 (R2.4)", () => {
    it("explorer_solo（両軸とも低）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 0, false, 4),
        ans("soloCollaboration", 0, false, 4),
      ]);
      expect(result!.quadrant).toBe("explorer_solo");
    });

    it("explorer_collab（探索低・協調高）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 0, false, 4),
        ans("soloCollaboration", 4, false, 4),
      ]);
      expect(result!.quadrant).toBe("explorer_collab");
    });

    it("deepener_solo（探索高・個人低）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 4, false, 4),
        ans("soloCollaboration", 0, false, 4),
      ]);
      expect(result!.quadrant).toBe("deepener_solo");
    });

    it("deepener_collab（両軸とも高）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 4, false, 4),
        ans("soloCollaboration", 4, false, 4),
      ]);
      expect(result!.quadrant).toBe("deepener_collab");
    });
  });

  describe("中点 (R2.5)", () => {
    it("軸スコアがちょうど50 → balanced=true かつ既定ポール(explorer/solo)へ解決", () => {
      // level=2, maxLevel=4 → 50
      const result = scoreTemperament([
        ans("explorationDeepening", 2, false, 4),
        ans("soloCollaboration", 2, false, 4),
      ]);
      expect(result!.axes.explorationDeepening).toBe(TEMPERAMENT_MIDPOINT);
      expect(result!.axes.soloCollaboration).toBe(TEMPERAMENT_MIDPOINT);
      expect(result!.balanced).toBe(true);
      expect(result!.quadrant).toBe("explorer_solo");
    });

    it("片方だけ中点でも balanced=true", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 2, false, 4), // 50
        ans("soloCollaboration", 4, false, 4), // 100
      ]);
      expect(result!.balanced).toBe(true);
      expect(result!.quadrant).toBe("explorer_collab");
    });

    it("どちらも中点でなければ balanced=false", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 4, false, 4),
        ans("soloCollaboration", 0, false, 4),
      ]);
      expect(result!.balanced).toBe(false);
    });
  });

  describe("正規化・平均", () => {
    it("スコアは 0..100 の範囲に収まる", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 1, false, 4),
        ans("explorationDeepening", 3, false, 4),
        ans("soloCollaboration", 2, false, 4),
      ]);
      const { explorationDeepening, soloCollaboration } = result!.axes;
      expect(explorationDeepening).toBeGreaterThanOrEqual(0);
      expect(explorationDeepening).toBeLessThanOrEqual(100);
      expect(soloCollaboration).toBeGreaterThanOrEqual(0);
      expect(soloCollaboration).toBeLessThanOrEqual(100);
    });

    it("混在 level が正しく平均される（(25+75)/2=50）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 1, false, 4), // 25
        ans("explorationDeepening", 3, false, 4), // 75
        ans("soloCollaboration", 2, false, 4),
      ]);
      expect(result!.axes.explorationDeepening).toBe(50);
    });

    it("2桁小数で丸められる（level=1,maxLevel=3 → 33.33）", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 1, false, 3),
        ans("soloCollaboration", 2, false, 4),
      ]);
      expect(result!.axes.explorationDeepening).toBe(33.33);
    });
  });

  describe("軸の欠落フォールバック", () => {
    it("片軸のみ回答されたとき、欠落軸は中点(50)・balanced=true", () => {
      const result = scoreTemperament([
        ans("explorationDeepening", 4, false, 4), // 100 → deepener
      ]);
      expect(result!.axes.explorationDeepening).toBe(100);
      expect(result!.axes.soloCollaboration).toBe(TEMPERAMENT_MIDPOINT);
      expect(result!.balanced).toBe(true);
      // 欠落軸は既定ポール solo
      expect(result!.quadrant).toBe("deepener_solo");
    });
  });

  describe("不変条件", () => {
    it("axes は常に両キーを持つ", () => {
      const result = scoreTemperament([ans("explorationDeepening", 4)]);
      expect(Object.keys(result!.axes).sort()).toEqual([
        "explorationDeepening",
        "soloCollaboration",
      ]);
    });

    it("quadrant は有効な Temperament union のいずれか", () => {
      const valid = [
        "explorer_solo",
        "explorer_collab",
        "deepener_solo",
        "deepener_collab",
      ];
      const result = scoreTemperament([
        ans("explorationDeepening", 3),
        ans("soloCollaboration", 1),
      ]);
      expect(valid).toContain(result!.quadrant);
    });

    it("決定論的：同一入力を2回で deep-equal", () => {
      const input = [
        ans("explorationDeepening", 3, false, 4),
        ans("explorationDeepening", 1, true, 4),
        ans("soloCollaboration", 2, false, 4),
      ];
      expect(scoreTemperament(input)).toEqual(scoreTemperament(input));
    });
  });
});

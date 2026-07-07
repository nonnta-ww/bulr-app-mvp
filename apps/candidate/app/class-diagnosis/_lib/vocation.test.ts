/**
 * vocation.ts — 職掌ベクトル畳み込みと主/副判定（純関数）の単体テスト。
 *
 * 決定論的ロジックの振る舞いを RED→GREEN で規定する。要件 1.1–1.7 をカバー。
 * DB/LLM に触れず、入力→出力の等価性・不変条件のみを検証する。
 */

import { describe, expect, it } from "vitest";

import type { Vocation } from "@bulr/types";

import { VOCATIONS } from "./definitions";
import { foldVocations, type VocationInput } from "./vocation";

/** categories を組み立てるヘルパ。 */
function cat(
  jobType: string,
  categoryName: string,
  categoryScore: number | null,
  answeredCount = 1,
) {
  return { jobType, categoryName, categoryScore, answeredCount };
}

describe("foldVocations", () => {
  it("単一サーベイ入力 → その jobType の職掌が主となる (1.1)", () => {
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 80, 3),
        cat("frontend", "JavaScript", 90, 4),
        cat("frontend", "React", 70, 2),
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("vanguard");
    // 前衛のみ寄与 → 他は 0
    expect(result.vector.rearguard).toBe(0);
    expect(result.vector.guardian).toBe(0);
  });

  it("ベクトルは常に7職掌全キーを持ち、対応サーベイ無しは0 (1.3, R12)", () => {
    const input: VocationInput = {
      categories: [cat("frontend", "HTML・CSS", 80, 3)],
    };
    const result = foldVocations(input);
    for (const v of VOCATIONS) {
      expect(result.vector).toHaveProperty(v);
      expect(typeof result.vector[v]).toBe("number");
    }
    // sage/strategist は対応サーベイ未整備 → 0
    expect(result.vector.sage).toBe(0);
    expect(result.vector.strategist).toBe(0);
  });

  it("クロスサーベイ入力 → 横断重みが反映され、backend 強 + 横断インフラで guardian が立つ (1.2)", () => {
    const input: VocationInput = {
      categories: [
        // backend 既定 → rearguard
        cat("backend", "API設計", 90, 5),
        cat("backend", "データベース", 85, 4),
        // 横断カテゴリ: rearguard 0.5 / guardian 0.5
        cat("backend", "DevOps・インフラ", 80, 4),
        cat("backend", "セキュリティ（認証・認可以外）", 70, 3), // rearguard 0.6 / guardian 0.4
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("rearguard");
    // guardian が横断重みで正の値を持つ
    expect(result.vector.guardian).toBeGreaterThan(0);
    // guardian が副候補（相対75%）に現れうる位置にあることを確認（少なくとも vector 上に立つ）
    expect(result.vector.rearguard).toBeGreaterThan(result.vector.guardian);
  });

  it("副職掌 相対75% 境界: ちょうど75% は含む (1.4)", () => {
    // primary=vanguard=100, 二番手=guardian=75 になるよう構成する。
    // frontend::セキュリティ = { vanguard:0.7, guardian:0.3 } を使い調整する。
    // 単純化: 2カテゴリで vanguard 平均100, guardian 平均75 を直接作る。
    const input: VocationInput = {
      categories: [
        // vanguard 既定 100
        cat("frontend", "HTML・CSS", 100, 1),
        // guardian を 75 にするため infrastructure-sre 既定(guardian:1) を 75 で
        cat("infrastructure-sre", "コンテナ・オーケストレーション", 75, 1),
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("vanguard");
    expect(result.vector.vanguard).toBe(100);
    expect(result.vector.guardian).toBe(75);
    // ちょうど 75% (=100*0.75) → 含む
    expect(result.subs).toContain<Vocation>("guardian");
  });

  it("副職掌 相対75% 境界: 75% 未満は除外 (1.4)", () => {
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 100, 1),
        cat("infrastructure-sre", "コンテナ・オーケストレーション", 74, 1),
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("vanguard");
    expect(result.vector.guardian).toBe(74);
    expect(result.subs).not.toContain<Vocation>("guardian");
    expect(result.subs).toHaveLength(0);
  });

  it("副職掌 上限2: 3つが条件を満たしても上位2つのみ (1.5)", () => {
    // vanguard=100(primary), 他3つ >=75 になるよう構成
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 100, 1), // vanguard 100
        cat("backend", "API設計", 90, 1), // rearguard 90
        cat("infrastructure-sre", "監視・オブザーバビリティ", 85, 1), // guardian 85
        cat("engineering-manager", "ピープルマネジメント", 80, 1), // commander 80
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("vanguard");
    // 3つとも >=75 だが上位2つのみ
    expect(result.subs).toHaveLength(2);
    expect(result.subs).toEqual<Vocation[]>(["rearguard", "guardian"]);
  });

  it("条件を満たす副が無い → 単独（subs 空） (1.4)", () => {
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 100, 1),
        cat("backend", "API設計", 50, 1), // rearguard 50 < 75
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("vanguard");
    expect(result.subs).toHaveLength(0);
  });

  it("決定論的 tiebreak: 同点トップは VOCATIONS displayOrder の先勝ち (1.6)", () => {
    // vanguard と rearguard を同スコアに。VOCATIONS 順で vanguard が先 → primary。
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 80, 1), // vanguard 80
        cat("backend", "API設計", 80, 1), // rearguard 80
      ],
    };
    const result = foldVocations(input);
    expect(result.vector.vanguard).toBe(result.vector.rearguard);
    expect(result.primary).toBe<Vocation>("vanguard");
    // 同点の rearguard は副（相対100% >= 75%）に入る
    expect(result.subs).toContain<Vocation>("rearguard");
  });

  it("決定論: 同一入力を2回 → 出力は deep-equal (1.7)", () => {
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 80, 3),
        cat("backend", "API設計", 60, 2),
        cat("infrastructure-sre", "監視・オブザーバビリティ", 70, 2),
      ],
    };
    const a = foldVocations(input);
    const b = foldVocations(input);
    expect(a).toEqual(b);
  });

  it("totalAnswered は answeredCount の総和", () => {
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 80, 3),
        cat("backend", "API設計", 60, 2),
      ],
    };
    const result = foldVocations(input);
    expect(result.totalAnswered).toBe(5);
  });

  it("categoryScore=null / answeredCount=0 は寄与しない", () => {
    const input: VocationInput = {
      categories: [
        cat("frontend", "HTML・CSS", 80, 3),
        cat("backend", "API設計", null, 5), // null → 寄与しない
        cat("infrastructure-sre", "監視", 90, 0), // answeredCount=0 → 寄与しない
      ],
    };
    const result = foldVocations(input);
    expect(result.primary).toBe<Vocation>("vanguard");
    expect(result.vector.rearguard).toBe(0);
    expect(result.vector.guardian).toBe(0);
    // totalAnswered は全カテゴリの answeredCount 総和（null/0 含む定義）
    expect(result.totalAnswered).toBe(8);
  });

  it("安全既定: 空入力 → primary=VOCATIONS[0], subs 空, totalAnswered=0", () => {
    const result = foldVocations({ categories: [] });
    expect(result.primary).toBe(VOCATIONS[0]);
    expect(result.subs).toHaveLength(0);
    expect(result.totalAnswered).toBe(0);
    for (const v of VOCATIONS) {
      expect(result.vector[v]).toBe(0);
    }
  });
});

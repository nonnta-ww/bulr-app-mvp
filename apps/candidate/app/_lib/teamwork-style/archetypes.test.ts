/**
 * archetypes.test.ts — 16タイプ・アーキタイプ正本のユニットテスト（R4.3/R4.5）。
 */

import { describe, expect, it } from "vitest";

import type { TeamworkCode } from "./axes";
import { TEAMWORK_ARCHETYPES } from "./archetypes";

const CANDOR = ["direct", "mediating"] as const;
const FOCUS = ["task", "relational"] as const;
const DISTANCE = ["dry", "wet"] as const;
const DISSENT = ["align", "diverge"] as const;

/** 4極の全組み合わせ（16 code）を canonical order で生成する。 */
function allCodes(): TeamworkCode[] {
  const codes: TeamworkCode[] = [];
  for (const c of CANDOR) {
    for (const f of FOCUS) {
      for (const d of DISTANCE) {
        for (const s of DISSENT) {
          codes.push(`${c}-${f}-${d}-${s}`);
        }
      }
    }
  }
  return codes;
}

describe("TEAMWORK_ARCHETYPES", () => {
  const codes = allCodes();

  it("16 code すべてが定義されている", () => {
    expect(codes).toHaveLength(16);
    expect(Object.keys(TEAMWORK_ARCHETYPES).sort()).toEqual([...codes].sort());
  });

  it("各タイプに name / catch / description / nextStep が揃っている", () => {
    for (const code of codes) {
      const a = TEAMWORK_ARCHETYPES[code];
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.catch.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.nextStep.length).toBeGreaterThan(0);
    }
  });

  it("正本（content-canon）の name/catch と厳密一致する（代表コード）", () => {
    // 4隅の代表コードで正本ドリフトを検知する。
    expect(TEAMWORK_ARCHETYPES["direct-task-dry-align"]).toMatchObject({
      name: "収束型ドライバー",
      catch: "一刀両断の推進者",
    });
    expect(TEAMWORK_ARCHETYPES["direct-relational-wet-diverge"]).toMatchObject({
      name: "共感型カタリスト",
      catch: "率直な世話役",
    });
    expect(TEAMWORK_ARCHETYPES["mediating-task-dry-diverge"]).toMatchObject({
      name: "探索型コーディネーター",
      catch: "静かな戦略家",
    });
    expect(TEAMWORK_ARCHETYPES["mediating-relational-wet-align"]).toMatchObject({
      name: "求心型ハーモナイザー",
      catch: "和を紡ぐまとめ役",
    });
  });

  it("name と catch はそれぞれ16タイプで一意", () => {
    const names = codes.map((c) => TEAMWORK_ARCHETYPES[c].name);
    const catches = codes.map((c) => TEAMWORK_ARCHETYPES[c].catch);
    expect(new Set(names).size).toBe(16);
    expect(new Set(catches).size).toBe(16);
  });

  it("文言に数字（順位・スコア）を含めない（非評価）", () => {
    for (const code of codes) {
      const a = TEAMWORK_ARCHETYPES[code];
      expect(`${a.name}${a.catch}${a.description}${a.nextStep}`).not.toMatch(
        /[0-9]/,
      );
    }
  });
});

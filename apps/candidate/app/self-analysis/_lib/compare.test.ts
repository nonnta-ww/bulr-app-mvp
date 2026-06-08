import { describe, it, expect } from "vitest";
import type { SelfAnalysisVersion } from "@bulr/db";
import { diffVersions } from "./compare";

// ---------------------------------------------------------------------------
// ヘルパー: SelfAnalysisVersion フィクスチャをインラインで組み立てる
// (DB 接続を引き起こさないよう runtime import は一切しない)
// ---------------------------------------------------------------------------

function makeVersion(
  versionIndex: number,
  overallCoverageRatio: number,
  categories: Array<{ categoryName: string; coverageRatio: number }>,
): SelfAnalysisVersion {
  return {
    responseId: `response-${versionIndex}`,
    versionIndex,
    submittedAt: new Date(`2026-0${versionIndex}-01T00:00:00Z`),
    aggregatedSnapshot: {
      jobType: "engineer",
      overallCoverageRatio,
      categories: categories.map((c) => ({
        categoryName: c.categoryName,
        coverageRatio: c.coverageRatio,
        answeredQuestions: Math.round(c.coverageRatio * 10),
        totalQuestions: 10,
        selectedBreadth: 3,
        freeTextPresence: false,
      })),
    },
    llmOutput: null,
  };
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("diffVersions", () => {
  // ケース 1: overallDelta が正確に計算される (Req 5.1)
  it("overallDelta = to.overall - from.overall を正確に算出する", () => {
    const from = makeVersion(1, 0.4, [{ categoryName: "技術", coverageRatio: 0.5 }]);
    const to = makeVersion(2, 0.7, [{ categoryName: "技術", coverageRatio: 0.8 }]);

    const result = diffVersions(from, to);

    expect(result.overallDelta).toBeCloseTo(0.3, 10);
  });

  // ケース 2: 負の overallDelta（to < from）
  it("overallDelta が負になるケース（全体網羅度が下がった）", () => {
    const from = makeVersion(1, 0.8, [{ categoryName: "技術", coverageRatio: 0.8 }]);
    const to = makeVersion(2, 0.5, [{ categoryName: "技術", coverageRatio: 0.5 }]);

    const result = diffVersions(from, to);

    expect(result.overallDelta).toBeCloseTo(-0.3, 10);
  });

  // ケース 3: カテゴリ増加・減少が同一 diff に含まれる (Req 5.1)
  it("カテゴリ増加（+0.3）と減少（-0.3）が同一 diff に含まれる", () => {
    const from = makeVersion(1, 0.6, [
      { categoryName: "技術", coverageRatio: 0.5 },
      { categoryName: "ビジネス", coverageRatio: 0.7 },
    ]);
    const to = makeVersion(2, 0.65, [
      { categoryName: "技術", coverageRatio: 0.8 },   // +0.3
      { categoryName: "ビジネス", coverageRatio: 0.4 }, // -0.3
    ]);

    const result = diffVersions(from, to);

    const tech = result.categories.find((c) => c.categoryName === "技術");
    const biz = result.categories.find((c) => c.categoryName === "ビジネス");

    expect(tech).toBeDefined();
    expect(tech!.from).toBeCloseTo(0.5, 10);
    expect(tech!.to).toBeCloseTo(0.8, 10);
    expect(tech!.delta).toBeCloseTo(0.3, 10);

    expect(biz).toBeDefined();
    expect(biz!.from).toBeCloseTo(0.7, 10);
    expect(biz!.to).toBeCloseTo(0.4, 10);
    expect(biz!.delta).toBeCloseTo(-0.3, 10);
  });

  // ケース 4: NEW カテゴリ（to のみに存在） → from:0, to:value, delta:value (Req 5.3)
  it("NEW カテゴリ（to のみ）は from=0, to=value, delta=value を返す", () => {
    const from = makeVersion(1, 0.4, [
      { categoryName: "技術", coverageRatio: 0.4 },
    ]);
    const to = makeVersion(2, 0.65, [
      { categoryName: "技術", coverageRatio: 0.6 },
      { categoryName: "データ", coverageRatio: 0.7 }, // NEW
    ]);

    const result = diffVersions(from, to);

    const newCat = result.categories.find((c) => c.categoryName === "データ");
    expect(newCat).toBeDefined();
    expect(newCat!.from).toBeCloseTo(0, 10);
    expect(newCat!.to).toBeCloseTo(0.7, 10);
    expect(newCat!.delta).toBeCloseTo(0.7, 10);
  });

  // ケース 5: DISAPPEARED カテゴリ（from のみに存在） → from:value, to:0, delta:-value (Req 5.3)
  it("DISAPPEARED カテゴリ（from のみ）は from=value, to=0, delta=-value を返す", () => {
    const from = makeVersion(1, 0.7, [
      { categoryName: "技術", coverageRatio: 0.6 },
      { categoryName: "ビジネス", coverageRatio: 0.8 }, // DISAPPEARED
    ]);
    const to = makeVersion(2, 0.5, [
      { categoryName: "技術", coverageRatio: 0.5 },
    ]);

    const result = diffVersions(from, to);

    const gone = result.categories.find((c) => c.categoryName === "ビジネス");
    expect(gone).toBeDefined();
    expect(gone!.from).toBeCloseTo(0.8, 10);
    expect(gone!.to).toBeCloseTo(0, 10);
    expect(gone!.delta).toBeCloseTo(-0.8, 10);
  });

  // ケース 6: カテゴリ順序 — from のカテゴリ順 → to のみのカテゴリ順 (stable union ordering)
  it("categories の順序が from 優先・次に to のみのカテゴリを初出現順で返す", () => {
    const from = makeVersion(1, 0.5, [
      { categoryName: "技術", coverageRatio: 0.5 },
      { categoryName: "ビジネス", coverageRatio: 0.6 },
    ]);
    const to = makeVersion(2, 0.65, [
      { categoryName: "ビジネス", coverageRatio: 0.7 },
      { categoryName: "データ", coverageRatio: 0.4 },  // to のみ
      { categoryName: "技術", coverageRatio: 0.6 },
    ]);

    const result = diffVersions(from, to);

    const names = result.categories.map((c) => c.categoryName);
    // from 先頭から「技術」「ビジネス」、次に to のみの「データ」
    expect(names).toEqual(["技術", "ビジネス", "データ"]);
  });

  // ケース 7: カテゴリが 0 件の版同士でも overallDelta のみ正確に返る
  it("カテゴリなし版同士の diff は categories=[] かつ overallDelta は正確", () => {
    const from = makeVersion(1, 0.3, []);
    const to = makeVersion(2, 0.6, []);

    const result = diffVersions(from, to);

    expect(result.categories).toEqual([]);
    expect(result.overallDelta).toBeCloseTo(0.3, 10);
  });
});

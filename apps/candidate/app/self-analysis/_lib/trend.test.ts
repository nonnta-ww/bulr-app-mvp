import { describe, it, expect } from "vitest";
import type { SelfAnalysisVersion } from "@bulr/db";
import { buildCoverageTrend } from "./trend";

// ---------------------------------------------------------------------------
// ヘルパー: SelfAnalysisVersion フィクスチャをインラインで組み立てる
// (DB 接続を引き起こさないよう runtime import は一切しない)
// ---------------------------------------------------------------------------

function makeVersion(
  versionIndex: number,
  submittedAt: Date,
  overallCoverageRatio: number,
  categories: Array<{ categoryName: string; coverageRatio: number }>,
  vizOnly = false,
): SelfAnalysisVersion {
  return {
    responseId: `response-${versionIndex}`,
    versionIndex,
    submittedAt,
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
    llmOutput: vizOnly
      ? null
      : {
          strengths: ["強み例"],
          weaknesses: ["弱み例"],
          growthActions: ["アクション例"],
        },
  };
}

const DATE_V1 = new Date("2026-01-01T00:00:00Z");
const DATE_V2 = new Date("2026-04-01T00:00:00Z");
const DATE_V3 = new Date("2026-07-01T00:00:00Z");

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("buildCoverageTrend", () => {
  // ケース 1: 0 件 → { overall: [], byCategory: [] } (Req 4.1)
  it("0 件履歴 → overall/byCategory ともに空配列を返す", () => {
    const result = buildCoverageTrend([]);
    expect(result.overall).toEqual([]);
    expect(result.byCategory).toEqual([]);
  });

  // ケース 2: 1 件 → overall に単一点 (Req 4.4); byCategory も各カテゴリ 1 点
  it("1 件履歴 → overall に単一 TrendPoint を返す (Req 4.4)", () => {
    const v1 = makeVersion(1, DATE_V1, 0.6, [
      { categoryName: "技術", coverageRatio: 0.5 },
      { categoryName: "ビジネス", coverageRatio: 0.7 },
    ]);

    const result = buildCoverageTrend([v1]);

    // overall: 単一点
    expect(result.overall).toHaveLength(1);
    expect(result.overall[0]).toEqual({
      versionIndex: 1,
      submittedAt: DATE_V1,
      value: 0.6,
    });

    // byCategory: 2 カテゴリそれぞれ 1 点
    expect(result.byCategory).toHaveLength(2);

    const tech = result.byCategory.find((c) => c.categoryName === "技術");
    expect(tech).toBeDefined();
    expect(tech!.points).toHaveLength(1);
    expect(tech!.points[0]).toEqual({
      versionIndex: 1,
      submittedAt: DATE_V1,
      value: 0.5,
    });

    const biz = result.byCategory.find((c) => c.categoryName === "ビジネス");
    expect(biz).toBeDefined();
    expect(biz!.points).toHaveLength(1);
    expect(biz!.points[0]).toEqual({
      versionIndex: 1,
      submittedAt: DATE_V1,
      value: 0.7,
    });
  });

  // ケース 3: 複数件 → overall が昇順 TrendPoint; 両版に存在するカテゴリは 2 点;
  //            v2 のみのカテゴリは 1 点 (v1 で欠けている版は point を生成しない)
  it("複数件履歴 → overall が入力順昇順; カテゴリは存在する版のみに点を生成する", () => {
    const v1 = makeVersion(1, DATE_V1, 0.4, [
      { categoryName: "技術", coverageRatio: 0.3 },
    ]);
    const v2 = makeVersion(2, DATE_V2, 0.7, [
      { categoryName: "技術", coverageRatio: 0.6 },
      { categoryName: "ビジネス", coverageRatio: 0.8 }, // v2 のみ
    ]);

    const result = buildCoverageTrend([v1, v2]);

    // overall: 2 点, 入力順（昇順）
    expect(result.overall).toHaveLength(2);
    expect(result.overall[0]).toEqual({
      versionIndex: 1,
      submittedAt: DATE_V1,
      value: 0.4,
    });
    expect(result.overall[1]).toEqual({
      versionIndex: 2,
      submittedAt: DATE_V2,
      value: 0.7,
    });

    // 「技術」は v1/v2 両方に存在 → 2 点
    const tech = result.byCategory.find((c) => c.categoryName === "技術");
    expect(tech).toBeDefined();
    expect(tech!.points).toHaveLength(2);
    expect(tech!.points[0]?.value).toBe(0.3);
    expect(tech!.points[1]?.value).toBe(0.6);

    // 「ビジネス」は v2 のみ → 1 点 (v1 の点は 0 埋めしない)
    const biz = result.byCategory.find((c) => c.categoryName === "ビジネス");
    expect(biz).toBeDefined();
    expect(biz!.points).toHaveLength(1);
    expect(biz!.points[0]).toEqual({
      versionIndex: 2,
      submittedAt: DATE_V2,
      value: 0.8,
    });
  });

  // ケース 4: llmOutput === null (viz_only 版) → overall/byCategory に含まれる (Req 4.3)
  it("viz_only 版 (llmOutput=null) でも overall および byCategory に点が含まれる (Req 4.3)", () => {
    const v1 = makeVersion(
      1,
      DATE_V1,
      0.5,
      [{ categoryName: "技術", coverageRatio: 0.4 }],
      false, // LLM あり
    );
    const v2viz = makeVersion(
      2,
      DATE_V2,
      0.75,
      [{ categoryName: "技術", coverageRatio: 0.65 }],
      true, // viz_only
    );
    const v3 = makeVersion(
      3,
      DATE_V3,
      0.9,
      [{ categoryName: "技術", coverageRatio: 0.85 }],
      false, // LLM あり
    );

    const result = buildCoverageTrend([v1, v2viz, v3]);

    // overall: 3 点すべて存在する
    expect(result.overall).toHaveLength(3);
    // v2 (viz_only) の overall 点が正しい値を持つ
    const v2Point = result.overall.find((p) => p.versionIndex === 2);
    expect(v2Point).toBeDefined();
    expect(v2Point!.value).toBe(0.75);
    expect(v2Point!.submittedAt).toEqual(DATE_V2);

    // byCategory「技術」: 3 点すべて存在する
    const tech = result.byCategory.find((c) => c.categoryName === "技術");
    expect(tech).toBeDefined();
    expect(tech!.points).toHaveLength(3);
    const v2CatPoint = tech!.points.find((p) => p.versionIndex === 2);
    expect(v2CatPoint).toBeDefined();
    expect(v2CatPoint!.value).toBe(0.65);
  });

  // ケース 5: カテゴリ順序が初出現順で安定している
  it("byCategory のカテゴリ順序が履歴全体を通じた初出現順で安定している", () => {
    // v1 に「ビジネス」「技術」の順、v2 に「データ」が初登場
    const v1 = makeVersion(1, DATE_V1, 0.5, [
      { categoryName: "ビジネス", coverageRatio: 0.5 },
      { categoryName: "技術", coverageRatio: 0.4 },
    ]);
    const v2 = makeVersion(2, DATE_V2, 0.6, [
      { categoryName: "技術", coverageRatio: 0.6 },
      { categoryName: "データ", coverageRatio: 0.3 }, // v2 で初登場
      { categoryName: "ビジネス", coverageRatio: 0.7 },
    ]);

    const result = buildCoverageTrend([v1, v2]);

    const names = result.byCategory.map((c) => c.categoryName);
    // 初出現順: v1 で「ビジネス」→「技術」、v2 で「データ」が追加
    expect(names).toEqual(["ビジネス", "技術", "データ"]);
  });
});

import { describe, it, expect } from "vitest";
import type { Vocation } from "@bulr/types";
import {
  VOCATIONS,
  TITLES,
  VOCATION_LABELS,
  TITLE_LABELS,
  CATEGORY_AFFINITY,
  JOBTYPE_DEFAULT_VOCATION,
  resolveCategoryVocationWeights,
  SUB_VOCATION_RATIO,
  SUB_VOCATION_MAX,
  BREADTH_ABS_THRESHOLD,
  BREADTH_WIDE_MIN,
  DEPTH_DEEP_MIN,
  LOW_CONFIDENCE_MIN_ANSWERS,
} from "./definitions";

/**
 * 実際に seed 済みの skill-survey (jobType → カテゴリ名) の完全なフィクスチャ。
 * このリストのすべてのペアが非空の職掌重みに解決されることをアフィニティ網羅テストで保証する。
 */
const SEEDED_JOBTYPE_CATEGORIES: Record<string, readonly string[]> = {
  "ai-ml": [
    "機械学習基礎",
    "モデル開発・評価",
    "データエンジニアリング",
    "推薦・検索",
    "MLOps",
    "分析・可視化",
  ],
  "ai-driven-development": [
    "AI支援開発ツール",
    "開発スタイル・ワークフロー",
    "テクニック",
    "品質・ガバナンス",
    "AI機能の開発経験",
    "AIリテラシー・学習姿勢",
  ],
  backend: [
    "プログラミング",
    "フレームワーク・ライブラリ",
    "データベース",
    "API開発",
    "セキュリティ（認証・認可以外）",
    "アーキテクチャ設計",
    "パフォーマンス・チューニング",
    "テスト",
    "DevOps・インフラ",
  ],
  "engineering-manager": [
    "マネジメント経験プロフィール",
    "ピープルマネジメント",
    "採用・チーム組成",
    "育成・キャリア支援",
    "パフォーマンスマネジメント",
    "デリバリーマネジメント",
    "技術リーダーシップ",
    "ステークホルダー・コミュニケーション",
    "戦略・組織運営",
    "チーム文化・エンゲージメント",
    "プロセス・オペレーショナルエクセレンス",
  ],
  "product-manager": [
    "PdM経験プロフィール",
    "プロダクト戦略",
    "ディスカバリー・顧客理解",
    "優先順位付け・意思決定",
    "ロードマップ・実行推進",
    "データドリブン運用",
    "ステークホルダー・組織連携",
    "GTM・グロース連携",
    "UX・ビジネス・テクノロジーの越境",
  ],
  frontend: [
    "HTML・CSS",
    "JavaScript",
    "フレームワーク・ライブラリ",
    "UI/UXスキル",
    "バックエンド連携",
    "セキュリティ",
    "アーキテクチャ設計",
    "パフォーマンス・チューニング",
    "テスト",
    "ビルド・デプロイ",
  ],
  "infrastructure-sre": [
    "クラウド・プラットフォーム",
    "コンテナ・オーケストレーション",
    "IaC・構成管理",
    "ネットワーク",
    "CI/CD・デリバリー",
    "OS・ミドルウェア",
    "可観測性",
    "信頼性設計",
    "インシデント対応・オンコール",
    "自動化・トイル削減",
    "セキュリティ・コンプライアンス",
    "パフォーマンス・スケーラビリティ・コスト最適化",
  ],
};

const EXPECTED_JOBTYPE_DEFAULT: Record<string, Vocation> = {
  frontend: "vanguard",
  backend: "rearguard",
  "infrastructure-sre": "guardian",
  "engineering-manager": "commander",
  "ai-driven-development": "ranger",
  "ai-ml": "sage",
  "product-manager": "strategist",
};

const sumWeights = (w: Partial<Record<Vocation, number>>): number =>
  Object.values(w).reduce((acc, v) => acc + (v ?? 0), 0);

describe("VOCATIONS", () => {
  it("7職掌を displayOrder（tiebreak 順）で保持する", () => {
    expect(VOCATIONS).toEqual([
      "vanguard",
      "rearguard",
      "guardian",
      "sage",
      "commander",
      "strategist",
      "ranger",
    ]);
  });

  it("重複がない", () => {
    expect(new Set(VOCATIONS).size).toBe(VOCATIONS.length);
  });

  it("すべての職掌に日本語ラベルがある", () => {
    for (const v of VOCATIONS) {
      expect(VOCATION_LABELS[v]).toBeTruthy();
    }
    expect(VOCATION_LABELS.vanguard).toBe("前衛");
  });
});

describe("TITLES ラベル", () => {
  it("4称号すべてにラベルがある", () => {
    expect(TITLES).toHaveLength(4);
    for (const t of TITLES) {
      expect(TITLE_LABELS[t]).toBeTruthy();
    }
  });
});

describe("JOBTYPE_DEFAULT_VOCATION", () => {
  it("seed 済み7職種を既定職掌へマップする", () => {
    for (const [jobType, vocation] of Object.entries(EXPECTED_JOBTYPE_DEFAULT)) {
      expect(JOBTYPE_DEFAULT_VOCATION[jobType]).toBe(vocation);
    }
  });

  it("sage は ai-ml で・strategist は product-manager で開放済み（全7職掌が活性）", () => {
    // sage は sage-survey spec で `ai-ml` → 'sage'、
    // strategist は pdm-strategist-survey spec で `product-manager` → 'strategist' として開放された。
    expect(JOBTYPE_DEFAULT_VOCATION["ai-ml"]).toBe("sage");
    expect(JOBTYPE_DEFAULT_VOCATION["product-manager"]).toBe("strategist");
    const mappedVocations = Object.values(JOBTYPE_DEFAULT_VOCATION);
    expect(mappedVocations).toContain("sage");
    expect(mappedVocations).toContain("strategist");
    // 7職掌すべてがいずれかの jobType にマップされている（非活性枠は解消）。
    expect(new Set(mappedVocations)).toEqual(new Set(VOCATIONS));
  });
});

describe("resolveCategoryVocationWeights — アフィニティ網羅", () => {
  it("(a) seed 済みの全 (jobType, category) ペアが非空の重みベクトルに解決される", () => {
    for (const [jobType, categories] of Object.entries(
      SEEDED_JOBTYPE_CATEGORIES,
    )) {
      for (const category of categories) {
        const weights = resolveCategoryVocationWeights(jobType, category);
        expect(
          Object.keys(weights).length,
          `${jobType}::${category} が空に解決された`,
        ).toBeGreaterThan(0);
        expect(
          sumWeights(weights),
          `${jobType}::${category} の重み合計が0`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("(b) 衝突カテゴリ名は正しい jobType の職掌に解決される", () => {
    const feArch = resolveCategoryVocationWeights("frontend", "アーキテクチャ設計");
    const beArch = resolveCategoryVocationWeights("backend", "アーキテクチャ設計");
    // frontend のアーキテクチャ設計は前衛、backend は後衛に主軸がある
    expect((feArch.vanguard ?? 0) > 0).toBe(true);
    expect(feArch.rearguard ?? 0).toBe(0);
    expect((beArch.rearguard ?? 0) > 0).toBe(true);
    expect(beArch.vanguard ?? 0).toBe(0);

    // 他の衝突カテゴリも jobType 既定へ解決される
    for (const collidingCat of [
      "フレームワーク・ライブラリ",
      "パフォーマンス・チューニング",
      "テスト",
    ]) {
      const fe = resolveCategoryVocationWeights("frontend", collidingCat);
      const be = resolveCategoryVocationWeights("backend", collidingCat);
      expect(fe.vanguard ?? 0).toBeGreaterThan(0);
      expect(be.rearguard ?? 0).toBeGreaterThan(0);
    }
  });

  it("(c) 未知 jobType は空を返す（寄与しない）", () => {
    expect(resolveCategoryVocationWeights("unknown-job", "何か")).toEqual({});
  });

  it("既定にない未知カテゴリは jobType 既定職掌にフォールバックする", () => {
    const weights = resolveCategoryVocationWeights(
      "frontend",
      "存在しない新カテゴリ",
    );
    expect(weights).toEqual({ vanguard: 1 });
  });

  it("明示的な CATEGORY_AFFINITY エントリが既定より優先される", () => {
    const weights = resolveCategoryVocationWeights("backend", "DevOps・インフラ");
    expect(weights).toEqual({ rearguard: 0.5, guardian: 0.5 });
  });

  it("product-manager 追加後も既存 jobType の解決結果が不変である（非回帰）", () => {
    // 新しい jobType キーの追加は純粋なキー参照である resolver の
    // 既存 jobType 解決に影響しない。代表点で明示的に確認する。
    expect(resolveCategoryVocationWeights("frontend", "HTML・CSS")).toEqual({
      vanguard: 1,
    });
    expect(resolveCategoryVocationWeights("backend", "データベース")).toEqual({
      rearguard: 1,
    });
    expect(
      resolveCategoryVocationWeights("infrastructure-sre", "ネットワーク"),
    ).toEqual({ guardian: 1 });
    expect(
      resolveCategoryVocationWeights("engineering-manager", "採用・チーム組成"),
    ).toEqual({ commander: 1 });
    expect(
      resolveCategoryVocationWeights("ai-driven-development", "テクニック"),
    ).toEqual({ ranger: 1 });
    // 先行して開放された ai-ml → sage も不変。
    expect(
      resolveCategoryVocationWeights("ai-ml", "MLOps"),
    ).toEqual({ sage: 1 });
    // 明示 affinity（横断カテゴリ）も不変。
    expect(
      resolveCategoryVocationWeights("frontend", "バックエンド連携"),
    ).toEqual({ vanguard: 0.6, rearguard: 0.4 });
  });

  it("重みは 0..1 の範囲に収まる", () => {
    for (const entry of Object.values(CATEGORY_AFFINITY)) {
      for (const w of Object.values(entry)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("全7職掌が seed 済み survey から解決される（非活性枠は解消）", () => {
  it("sage・strategist を含む7職掌すべてが resolver 出力に現れる", () => {
    const produced = new Set<Vocation>();
    for (const [jobType, categories] of Object.entries(
      SEEDED_JOBTYPE_CATEGORIES,
    )) {
      for (const category of categories) {
        for (const v of Object.keys(
          resolveCategoryVocationWeights(jobType, category),
        ) as Vocation[]) {
          produced.add(v);
        }
      }
    }
    // sage は ai-ml（sage-survey spec）、strategist は product-manager
    // （pdm-strategist-survey spec）の全カテゴリが解決する。
    expect(produced.has("sage")).toBe(true);
    expect(produced.has("strategist")).toBe(true);
    // 7職掌すべてがいずれかの seed 済み survey から解決される。
    for (const v of VOCATIONS) {
      expect(produced.has(v), `${v} がどの resolver 出力にも現れない`).toBe(true);
    }
  });

  it("ai-ml の各カテゴリは { sage: 1 } に解決される", () => {
    for (const category of SEEDED_JOBTYPE_CATEGORIES["ai-ml"] ?? []) {
      expect(resolveCategoryVocationWeights("ai-ml", category)).toEqual({
        sage: 1,
      });
    }
  });

  it("product-manager の各カテゴリは { strategist: 1 } に解決される", () => {
    for (const category of SEEDED_JOBTYPE_CATEGORIES["product-manager"] ?? []) {
      expect(resolveCategoryVocationWeights("product-manager", category)).toEqual(
        {
          strategist: 1,
        },
      );
    }
  });
});

describe("判定パラメータ定数", () => {
  it("設計どおりの値を持つ", () => {
    expect(SUB_VOCATION_RATIO).toBe(0.75);
    expect(SUB_VOCATION_MAX).toBe(2);
    expect(BREADTH_ABS_THRESHOLD).toBe(60);
    expect(BREADTH_WIDE_MIN).toBe(4);
    expect(DEPTH_DEEP_MIN).toBe(70);
    expect(LOW_CONFIDENCE_MIN_ANSWERS).toBe(8);
  });
});

/**
 * trend.ts — 成長推移の時系列整形 純関数
 *
 * SelfAnalysisVersion の配列（history）を受け取り、全体網羅度とカテゴリ別網羅度の
 * 時系列（TrendPoint の配列）を生成する。
 *
 * 設計上の注意:
 * - 副作用なし・決定論的（now などの外部依存は持たない）。
 * - llmOutput === null の版（可視化のみ）も網羅度は aggregatedSnapshot から取得し、
 *   時系列に含める（Req 4.3）。LLM 生成の有無で点を除外してはならない。
 * - カテゴリが特定の版に存在しない場合は 0 を補完せず、その版の点を省略する。
 * - import は TYPE-ONLY。DB クライアントをランタイムに読み込まない。
 */

import type { SelfAnalysisVersion } from "@bulr/db";

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

/** 時系列の単一データ点 */
export interface TrendPoint {
  /** 版インデックス（1-based, history 入力順） */
  versionIndex: number;
  /** 版の提出日時 */
  submittedAt: Date;
  /** 網羅度（0..1） */
  value: number;
}

/** buildCoverageTrend の戻り値 */
export interface CoverageTrend {
  /** 全体網羅度の時系列（history の入力順） */
  overall: TrendPoint[];
  /** カテゴリ別網羅度の時系列。カテゴリ順は全版を通じた初出現順 */
  byCategory: Array<{ categoryName: string; points: TrendPoint[] }>;
}

// ---------------------------------------------------------------------------
// 公開関数
// ---------------------------------------------------------------------------

/**
 * SelfAnalysisVersion 配列から CoverageTrend を生成する。
 *
 * - history は入力順（source_submitted_at 昇順 versionIndex 昇順）を前提とする。
 *   ただし入力順以外で呼び出しても versionIndex / submittedAt はそのまま使用する。
 * - 空配列を渡すと { overall: [], byCategory: [] } を返す（Req 4.1）。
 * - 1 件の場合も単一点として返す（Req 4.4）。
 *
 * @param history - getSelfAnalysisHistory が返す版配列（昇順）
 */
export function buildCoverageTrend(history: SelfAnalysisVersion[]): CoverageTrend {
  if (history.length === 0) {
    return { overall: [], byCategory: [] };
  }

  // --- overall: 版ごとに1点（input order = ascending versionIndex）---
  const overall: TrendPoint[] = history.map((v) => ({
    versionIndex: v.versionIndex,
    submittedAt: v.submittedAt,
    value: v.aggregatedSnapshot.overallCoverageRatio,
  }));

  // --- byCategory: カテゴリ名の和集合を初出現順で収集 ---
  // まず全版を走査して、カテゴリ名の初出現順リストを作る
  const categoryOrder: string[] = [];
  const categorySet = new Set<string>();

  for (const v of history) {
    for (const cat of v.aggregatedSnapshot.categories) {
      if (!categorySet.has(cat.categoryName)) {
        categorySet.add(cat.categoryName);
        categoryOrder.push(cat.categoryName);
      }
    }
  }

  // 各カテゴリについて、そのカテゴリを含む版のみ TrendPoint を生成する
  const byCategory = categoryOrder.map((categoryName) => {
    const points: TrendPoint[] = [];

    for (const v of history) {
      const cat = v.aggregatedSnapshot.categories.find(
        (c) => c.categoryName === categoryName,
      );
      if (cat !== undefined) {
        points.push({
          versionIndex: v.versionIndex,
          submittedAt: v.submittedAt,
          value: cat.coverageRatio,
        });
      }
      // カテゴリがこの版に存在しない場合は点を省略（0 埋め禁止）
    }

    return { categoryName, points };
  });

  return { overall, byCategory };
}

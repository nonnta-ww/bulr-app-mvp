/**
 * compare.ts — 2版の網羅度差分 純関数
 *
 * 2つの SelfAnalysisVersion を受け取り、全体・カテゴリ別の網羅度増減差分を返す。
 * 新規カテゴリ（to のみ）・消失カテゴリ（from のみ）も 0 をベースラインとして
 * 有意な delta を算出する（Req 5.1, 5.3）。
 *
 * 設計上の注意:
 * - 副作用なし・決定論的。
 * - import は TYPE-ONLY。DB クライアントをランタイムに読み込まない。
 * - カテゴリ順序: from のカテゴリ順 → to のみのカテゴリ順（初出現順で安定）。
 * - 新規カテゴリ (absent in from): from=0, to=value, delta=value。
 * - 消失カテゴリ (absent in to): from=value, to=0, delta=-value。
 */

import type { SelfAnalysisVersion } from "@bulr/db";

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

/** カテゴリ別の網羅度差分 */
export interface CategoryDelta {
  categoryName: string;
  /** from 版での網羅度（カテゴリが存在しない場合は 0） */
  from: number;
  /** to 版での網羅度（カテゴリが存在しない場合は 0） */
  to: number;
  /** to - from */
  delta: number;
}

/** diffVersions の戻り値 */
export interface VersionDiff {
  /** to.overallCoverageRatio - from.overallCoverageRatio */
  overallDelta: number;
  /** カテゴリ別差分一覧（from 優先・初出現順） */
  categories: CategoryDelta[];
}

// ---------------------------------------------------------------------------
// 公開関数
// ---------------------------------------------------------------------------

/**
 * 2つの SelfAnalysisVersion から全体・カテゴリ別の網羅度差分を算出する。
 *
 * カテゴリの union は以下の順序で構築する:
 *   1. from の categories を先頭から順番に追加。
 *   2. to のみに存在するカテゴリを to の順番で追加。
 * これにより安定した初出現順の順序が保証される。
 *
 * @param from - 比較元版（古い版）
 * @param to - 比較先版（新しい版）
 */
export function diffVersions(from: SelfAnalysisVersion, to: SelfAnalysisVersion): VersionDiff {
  const overallDelta =
    to.aggregatedSnapshot.overallCoverageRatio -
    from.aggregatedSnapshot.overallCoverageRatio;

  // from・to の categories を categoryName → coverageRatio のマップに変換
  const fromMap = new Map<string, number>(
    from.aggregatedSnapshot.categories.map((c) => [c.categoryName, c.coverageRatio]),
  );
  const toMap = new Map<string, number>(
    to.aggregatedSnapshot.categories.map((c) => [c.categoryName, c.coverageRatio]),
  );

  // union を「from のカテゴリ順」→「to のみのカテゴリ順」で構築（初出現順で安定）
  const unionNames: string[] = [];
  const seen = new Set<string>();

  for (const cat of from.aggregatedSnapshot.categories) {
    if (!seen.has(cat.categoryName)) {
      seen.add(cat.categoryName);
      unionNames.push(cat.categoryName);
    }
  }
  for (const cat of to.aggregatedSnapshot.categories) {
    if (!seen.has(cat.categoryName)) {
      seen.add(cat.categoryName);
      unionNames.push(cat.categoryName);
    }
  }

  const categories: CategoryDelta[] = unionNames.map((categoryName) => {
    const fromValue = fromMap.get(categoryName) ?? 0;
    const toValue = toMap.get(categoryName) ?? 0;
    return {
      categoryName,
      from: fromValue,
      to: toValue,
      delta: toValue - fromValue,
    };
  });

  return { overallDelta, categories };
}

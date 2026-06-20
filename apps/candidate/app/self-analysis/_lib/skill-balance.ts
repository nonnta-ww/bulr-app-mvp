/**
 * スキルバランス（熟練度レーダー）用の純粋データ変換
 *
 * AggregatedSnapshot のカテゴリ別 proficiencyScore からレーダー描画点を選別する。
 * 副作用・I/O は持たない。SkillBalanceRadar コンポーネントの描画判断の中核。
 *
 * - proficiencyScore が欠損（null / undefined）のカテゴリは「0」ではなく除外する（Req 6.3）。
 * - score=0 は有効値として保持する。
 *
 * Boundary: SkillBalanceRadar
 * Requirements: 6.1, 6.3
 */

/** レーダーに描画するカテゴリ（有効な熟練度スコアを持つもの） */
export interface RadarCategoryPoint {
  categoryName: string;
  proficiencyScore: number;
}

/** 熟練度スコアを持つカテゴリのみを入力順で抽出する（null/undefined は欠損として除外） */
export function selectRadarPoints(
  categories: ReadonlyArray<{ categoryName: string; proficiencyScore?: number | null }>,
): RadarCategoryPoint[] {
  const points: RadarCategoryPoint[] = [];
  for (const c of categories) {
    if (c.proficiencyScore !== null && c.proficiencyScore !== undefined) {
      points.push({ categoryName: c.categoryName, proficiencyScore: c.proficiencyScore });
    }
  }
  return points;
}

/** 表示に足る熟練度データが無い（0カテゴリ or 全件欠損）かどうか（Req 6.3） */
export function isRadarEmpty(
  categories: ReadonlyArray<{ categoryName: string; proficiencyScore?: number | null }>,
): boolean {
  return selectRadarPoints(categories).length === 0;
}

/**
 * 評価ヒートマップで使うベンチマーク値と色判定。
 * Stage 1 ではルーブリック定義に基づく固定値。Stage 2 で経験的データに切替を検討。
 * 設計ドキュメント: docs/superpowers/specs/2026-05-18-heatmap-redesign-design.md §4
 */

export const BENCHMARKS = {
  authenticity: 2.0,
  judgment: 2.0,
  scope: 3.0,
  meta_cognition: 2.0,
  ai_literacy: 1.5,
} as const;

export type ScoreLevel = 'high' | 'mid' | 'low';

/** 0-3 軸（真贋・判断力・メタ認知・AI活用）のスコアレベル判定 */
export function scoreLevel03(value: number): ScoreLevel {
  if (value >= 2.5) return 'high';
  if (value >= 1.5) return 'mid';
  return 'low';
}

/** 1-5 軸（射程）のスコアレベル判定 */
export function scoreLevelScope(value: number): ScoreLevel {
  if (value >= 3.5) return 'high';
  if (value >= 2.5) return 'mid';
  return 'low';
}

/** ScoreLevel → Tailwind 背景色クラス */
export const BAR_COLOR_CLASS: Record<ScoreLevel, string> = {
  high: 'bg-emerald-500',
  mid: 'bg-amber-400',
  low: 'bg-red-500',
};

/** 5 次元の表示順 / 日本語ラベル */
export const DIMENSION_ORDER = [
  'authenticity',
  'judgment',
  'scope',
  'meta_cognition',
  'ai_literacy',
] as const;
export type DimensionKey = (typeof DIMENSION_ORDER)[number];

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  authenticity: '真贋',
  judgment: '判断力',
  scope: '射程',
  meta_cognition: 'メタ認知',
  ai_literacy: 'AI活用',
};

/** カテゴリ日本語ラベル（既存 heatmap.tsx と一致） */
export const CATEGORY_LABEL = {
  design: 'システム設計',
  trouble: 'トラブル対応',
  performance: 'パフォーマンス',
  security: 'セキュリティ',
  organization: '組織・マネジメント',
  ai: 'AI活用',
} as const;

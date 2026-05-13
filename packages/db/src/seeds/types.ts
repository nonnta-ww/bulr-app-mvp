import type { PatternCategory } from '../schema/assessment-pattern';

// Re-export for convenience
export type { PatternCategory };

/**
 * AssessmentPatternCode — template literal 型で prefix + 2桁番号の緩い制約を表現
 * 厳密な検証は SeedScript 側で runtime regex チェック (^[DTPSOA]-\d{2}$) を実施
 */
export type AssessmentPatternCode = `${'D' | 'T' | 'P' | 'S' | 'O' | 'A'}-${string}`;

/**
 * AssessmentPatternSeed — シードデータ用の型定義
 * DB カラム (id / created_at / updated_at) を除いた必須プロパティ
 * フィールド名は DB カラム名と 1:1 の snake_case
 */
export type AssessmentPatternSeed = {
  code: AssessmentPatternCode;
  category: PatternCategory;
  title: string;
  description: string;
  expected_scope_min: 1 | 2 | 3 | 4 | 5;
  expected_scope_max: 1 | 2 | 3 | 4 | 5;
  level_1_intro: string;
  level_2_focus: string;
  level_3_focus: string;
  level_4_focus: string;
  signals: readonly string[];
  ai_perspective: string;
  is_active?: boolean; // デフォルト true、upsert の SET 句から除外されるため INSERT 時のみ反映
};

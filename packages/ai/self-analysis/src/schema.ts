// Requirements: 3.1, 3.2, 3.3, 3.4
// @bulr/ai-self-analysis — Zod 出力スキーマ + 入出力型定義
// @bulr/db に依存しない（ローカル定義）

import { z } from 'zod';

// ──────────────────────────────────────────────
// 出力 Zod スキーマ
// ──────────────────────────────────────────────

/**
 * 強み弱みサマリ・成長アクションの出力スキーマ。
 * 各要素は文字列のみ（数値スコア・他者比較フィールドは一切持たない）。
 * 要件 3.4: 数値スコア・他者比較・順位付けを含めない。
 */
export const selfAnalysisNarrativeSchema = z.object({
  /** 強み: 回答に存在する選択ラベル/自由記述に紐づく記述（各 max 300 字） */
  strengths: z.array(z.string().max(300)),
  /** 弱み/手薄な領域: 未選択・低網羅・自由記述の薄さとして記述（各 max 300 字） */
  weaknesses: z.array(z.string().max(300)),
  /** 次に伸ばすべき点・具体的な次の一歩（各 max 500 字） */
  growthActions: z.array(z.string().max(500)),
});

export type SelfAnalysisNarrative = z.infer<typeof selfAnalysisNarrativeSchema>;

// ──────────────────────────────────────────────
// 入力型（@bulr/db 非依存・ローカル定義）
// ──────────────────────────────────────────────

/**
 * 集計スナップショット内のカテゴリ別カバレッジ情報。
 * design.md §aggregate _lib の CategoryCoverage に対応。
 */
export interface CategoryCoverage {
  categoryName: string;
  answeredQuestions: number;
  totalQuestions: number;
  coverageRatio: number;      // answered/total（0..1）
  selectedBreadth: number;    // 選択肢選択の総数（広さ）
  freeTextPresence: boolean;  // 自由記述の有無
}

/**
 * 決定論的集計スナップショット。
 * design.md §aggregate _lib の AggregatedSnapshot に対応。
 */
export interface AggregatedSnapshot {
  jobType: string;
  categories: CategoryCoverage[];
  overallCoverageRatio: number;
}

/**
 * generateSelfAnalysisNarrative への入力型。
 * design.md §packages/ai — @bulr/ai-self-analysis の SelfAnalysisGenInput に準拠。
 */
export interface SelfAnalysisGenInput {
  jobType: string;
  aggregated: AggregatedSnapshot;
  answers: Array<{
    categoryName: string;
    questionBody: string;
    selectedLabels: string[];
    freeText: string | null;
  }>;
}

/**
 * generateSelfAnalysisNarrative の戻り値型。
 */
export interface SelfAnalysisGenResult {
  output: SelfAnalysisNarrative;
  usage: { input_tokens: number; output_tokens: number };
}

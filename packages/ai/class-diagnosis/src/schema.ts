// Requirements: 7.1, 7.2, 4.3
// @bulr/ai-class-diagnosis — Zod 出力スキーマ + 入出力型定義
// 契約型（ClassResult / ClassFlavor）は @bulr/types から import（再定義しない）

import { z } from 'zod';
import type { ClassResult, ClassFlavor } from '@bulr/types';

// ──────────────────────────────────────────────
// 出力 Zod スキーマ
// ──────────────────────────────────────────────

/**
 * クラスフレーバー文の出力スキーマ。
 * tagline / description / nextStepHint の3文字列のみ（数値スコア・他者比較フィールドなし）。
 * 要件 7.2: 数値スコア・他者比較・順位付けを含めない。
 * 要件 4.3: nextStepHint は隣接クラスへの成長を示唆する。
 */
export const classFlavorSchema = z.object({
  /** キャッチコピー（max 80 字） */
  tagline: z.string().max(80),
  /** クラスの説明文（max 400 字） */
  description: z.string().max(400),
  /** 次の一歩・隣接クラスへの成長ヒント（max 200 字） */
  nextStepHint: z.string().max(200),
});

// zod スキーマが @bulr/types の永続化契約 ClassFlavor と一致することの型レベル保証。
type _AssertFlavor = z.infer<typeof classFlavorSchema> extends ClassFlavor
  ? ClassFlavor extends z.infer<typeof classFlavorSchema>
    ? true
    : never
  : never;

// ──────────────────────────────────────────────
// 入力型
// ──────────────────────────────────────────────

/**
 * generateClassFlavor への入力型。
 * result（決定論的クラス判定）＋ answers（回答文脈のラベル）のみ。
 * 数値ベクトル値は buildClassFlavorPrompt がプロンプトに含めない（Grounding R7.2）。
 */
export interface ClassFlavorInput {
  result: ClassResult;
  answers: Array<{
    categoryName: string;
    selectedLabels: string[];
    freeText: string | null;
  }>;
}

/**
 * generateClassFlavor の戻り値型。
 */
export interface ClassFlavorGenResult {
  output: ClassFlavor; // = z.infer<typeof classFlavorSchema>
  usage: { input_tokens: number; output_tokens: number };
}

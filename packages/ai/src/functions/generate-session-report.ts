// Requirements 8.7, 8.10, 8.12, 11.5, 12.5, 13.6
// _Boundary: GenerateSessionReport_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import type { LlmContext } from '../lib/create-llm-context';
import { validateAndFallback, SAFE_SESSION_REPORT_FALLBACK } from '../lib/validate-llm-output';
import type { HeatmapData } from '@bulr/types/evaluation';
import type { PatternCoverage, InterviewTurn } from '@bulr/db/schema';

// Requirement 8.10: reportOutputSchema を Zod で定義
// Requirement 11.5: heatmap_data は 6 カテゴリ × 5 次元平均 + pattern_count の JSON

const categoryStatsSchema = z.object({
  avg_authenticity: z.number(),
  avg_judgment: z.number(),
  avg_scope: z.number(),
  avg_meta_cognition: z.number(),
  avg_ai_literacy: z.number(),
  pattern_count: z.number().int().min(0),
});

const heatmapDataSchema = z.object({
  by_category: z.object({
    design: categoryStatsSchema,
    trouble: categoryStatsSchema,
    performance: categoryStatsSchema,
    security: categoryStatsSchema,
    organization: categoryStatsSchema,
    ai: categoryStatsSchema,
  }),
  // Note: Record<1|2|3|4|5, number> has numeric keys in the TS type,
  // but Zod object keys are always strings — cast at use site.
  scope_distribution: z.object({
    '1': z.number(),
    '2': z.number(),
    '3': z.number(),
    '4': z.number(),
    '5': z.number(),
  }),
  ai_literacy_distribution: z.object({
    '0': z.number(),
    '1': z.number(),
    '2': z.number(),
    '3': z.number(),
  }),
  free_question_count: z.number().int().min(0),
});

export const reportOutputSchema = z.object({
  heatmap_data: heatmapDataSchema,
  summary_text: z.string().max(10000),
  generated_at: z.string(),
});

// Requirement 8.11: summary_text サイズ上限
const SUMMARY_TEXT_LIMIT = 10000;

function buildPrompt(allCoverage: PatternCoverage[], freeQuestions: InterviewTurn[]): string {
  const parts: string[] = [];

  // Coverage data
  const coverageSummary = allCoverage
    .map((c) => {
      const evaluation = c.llm_evaluation;
      return [
        `パターンID: ${c.pattern_id}`,
        `  到達レベル: ${c.level_reached}`,
        `  詰まりタイプ: ${c.stuck_type ?? 'なし'}`,
        `  authenticity: ${evaluation.authenticity}`,
        `  judgment: ${evaluation.judgment}`,
        `  scope: ${evaluation.scope}`,
        `  meta_cognition: ${evaluation.meta_cognition}`,
        `  ai_literacy: ${evaluation.ai_literacy}`,
        `  メモ: ${evaluation.notes}`,
      ].join('\n');
    })
    .join('\n\n');

  parts.push(`## 全パターンカバレッジ（${allCoverage.length} パターン）\n${coverageSummary || '（データなし）'}`);

  // Requirement 12.5: フリー質問は別セクションで総評
  if (freeQuestions.length > 0) {
    const freeQSummary = freeQuestions
      .map((t, i) => {
        const candidate = t.transcript.candidate ?? '';
        return `### フリー質問 ${i + 1}\n質問: ${t.question_text}\n回答: ${candidate.slice(0, 500)}`;
      })
      .join('\n\n');
    parts.push(`## フリー質問（${freeQuestions.length} 件）\n${freeQSummary}`);
  } else {
    parts.push(`## フリー質問\n（フリー質問なし）`);
  }

  parts.push(`## タスク
以下を JSON で返してください：

### heatmap_data
6 カテゴリ（design/trouble/performance/security/organization/ai）それぞれについて：
- avg_authenticity, avg_judgment, avg_scope, avg_meta_cognition, avg_ai_literacy: 0〜3（または 1〜5）の平均値
- pattern_count: 評価したパターン数

scope_distribution: スコープ 1〜5 の分布カウント
ai_literacy_distribution: AI リテラシー 0〜3 の分布カウント
free_question_count: フリー質問の件数

### summary_text
- 候補者の強みと改善点を簡潔にまとめた総評（10000 文字以内）
- フリー質問がある場合は、フリー質問セクションでその内容を別途総評に含める
- 採用推奨コメントは含めない

### generated_at
- ISO 8601 形式の現在時刻`);

  return parts.join('\n\n---\n\n');
}

// Requirement 13.6: 採用推奨を含めないシステムプロンプト
const SESSION_REPORT_SYSTEM_PROMPT = `あなたは面接評価レポートを生成する AI アシスタントです。

## 重要な制約
- 採用推奨コメントを生成しないでください
- 「採用を推奨します」「不採用にすべきです」などの採用可否を示唆する表現は使わないでください
- 採用の最終判断は面接官・採用担当者が行うものです

## 出力内容
- 候補者のスキルと経験の客観的な整理
- 各カテゴリの評価データの集計（heatmap_data）
- フリー質問がある場合は、別セクションとしてその内容の総評を summary_text に含める
- 採用可否に関わらない、面接での観察事実の要約

## フリー質問の扱い
フリー質問（pattern_id が null のターン）は、通常の評価パターンとは別セクションとして summary_text の中で総評してください。

すべての出力は日本語で行ってください。`;

// Requirement 8.7: generateSessionReport 関数
export async function generateSessionReport(input: {
  allCoverage: PatternCoverage[];
  freeQuestions: InterviewTurn[];
  ctx: LlmContext;
}): Promise<{ heatmap_data: HeatmapData; summary_text: string; generated_at: string }> {
  const prompt = buildPrompt(input.allCoverage, input.freeQuestions);

  // Requirement 8.10: generateObject + Zod スキーマで structured output
  const { object } = await generateObject({
    model: claudeSonnet46,
    system: SESSION_REPORT_SYSTEM_PROMPT,
    schema: reportOutputSchema,
    prompt,
    maxRetries: 2,
  });

  // Ensure generated_at is set to current time (do not trust LLM-provided time)
  const generated_at = new Date().toISOString();

  // Requirement 8.12: validateAndFallback で Zod 検証、失敗時は SAFE_SESSION_REPORT_FALLBACK
  const validated = validateAndFallback(
    { ...object, generated_at },
    reportOutputSchema,
    SAFE_SESSION_REPORT_FALLBACK,
    'generateSessionReport',
  );

  // Enforce summary_text size limit
  const summary_text = validated.summary_text.slice(0, SUMMARY_TEXT_LIMIT);

  // Cast heatmap_data: Zod parses numeric-key objects as string-keyed,
  // but HeatmapData TS type uses numeric literal keys — cast via unknown.
  const heatmap_data = validated.heatmap_data as unknown as HeatmapData;

  return {
    heatmap_data,
    summary_text,
    generated_at: validated.generated_at,
  };
}

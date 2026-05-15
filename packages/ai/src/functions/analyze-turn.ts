// Requirements 8.1, 8.2, 8.10, 8.11, 8.12, 12.2, 13.1, 13.6, 18.2, 18.3, 24.1
// _Boundary: AnalyzeTurn_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import { buildSystemPrompt } from '../prompts/system-prompt';
import type { LlmContext } from '../lib/create-llm-context';
import { validateAndFallback, SAFE_LLM_ANALYSIS_FALLBACK } from '../lib/validate-llm-output';
import type { LlmAnalysis } from '@bulr/types/evaluation';

// Requirement 8.2: analyzeTurnOutputSchema を Zod で定義
export const analyzeTurnOutputSchema = z.object({
  signals: z.object({
    authenticity: z.enum(['observed', 'partial', 'absent']),
    judgment: z.enum(['observed', 'partial', 'absent']),
    meta_cognition: z.enum(['observed', 'partial', 'absent']),
    ai_literacy: z.enum(['observed', 'partial', 'absent']),
  }),
  scope_signal: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.null(),
  ]),
  level_reached_estimate: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  // Requirement 12.2: pattern_match_confidence の 4 値
  pattern_match_confidence: z.enum(['exact', 'inferred_high', 'inferred_low', 'off_pattern']),
  // Requirement 24.1: matched_pattern_id (off_pattern 時は null)
  matched_pattern_id: z.string().nullable(),
  stuck_signal: z
    .enum(['not_experienced', 'shallow', 'single_option', 'rigid'])
    .nullable(),
  nearest_patterns: z.array(z.string()).optional(),
  off_pattern_summary: z.string().max(2000).optional(),
  notes: z.string().max(2000),
});

type TurnHistory = { question: string; answer: string };
type CurrentPattern = { id: string; code: string; title: string; description: string };

// Requirement 8.11: transcript/history サイズ上限
const TRANSCRIPT_LIMIT = 10000;
const HISTORY_TOTAL_LIMIT = 50000;

function truncateHistory(history: TurnHistory[]): TurnHistory[] {
  // 末尾から古い履歴を打ち切る（新しい履歴を優先）
  const result: TurnHistory[] = [];
  let totalChars = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i]!;
    const turnChars = turn.question.length + turn.answer.length;
    if (totalChars + turnChars > HISTORY_TOTAL_LIMIT) {
      break;
    }
    result.unshift(turn);
    totalChars += turnChars;
  }

  return result;
}

function buildPrompt(
  transcript: string,
  currentPattern: CurrentPattern | undefined,
  history: TurnHistory[],
): string {
  const parts: string[] = [];

  // Requirement 13.1: transcript には候補者発話のみが含まれる
  parts.push(`## 候補者の発話（今回のターン）\n${transcript}`);

  if (currentPattern != null) {
    parts.push(
      `## 現在の評価パターン\nID: ${currentPattern.id}\nコード: ${currentPattern.code}\nタイトル: ${currentPattern.title}\n説明: ${currentPattern.description}`,
    );
  } else {
    // Requirement 24.1: manual ターン（currentPattern=undefined）の場合も最近傍パターンを判定
    parts.push(
      `## 現在の評価パターン\n（フリー質問モード — currentPattern 未設定。候補者の発話から最近傍パターンを判定し matched_pattern_id に設定してください）`,
    );
  }

  if (history.length > 0) {
    const historyText = history
      .map((h, i) => `### ターン ${i + 1}\n質問: ${h.question}\n回答: ${h.answer}`)
      .join('\n\n');
    parts.push(`## 面接履歴\n${historyText}`);
  }

  parts.push(`## タスク
上記の候補者発話を分析し、以下を JSON で返してください：
- signals: 4 軸シグナル（authenticity/judgment/meta_cognition/ai_literacy）それぞれ observed/partial/absent
- scope_signal: スコープ信号（1〜5 の整数、または null）
- level_reached_estimate: 到達段階推定（0〜4 の整数）
- pattern_match_confidence: パターン一致信頼度（exact/inferred_high/inferred_low/off_pattern）
- matched_pattern_id: 一致したパターン ID（off_pattern の場合は null）
- stuck_signal: 詰まり信号（not_experienced/shallow/single_option/rigid または null）
- nearest_patterns: 近傍パターン ID のリスト（任意）
- off_pattern_summary: off_pattern の場合の要約（任意、2000 文字以内）
- notes: 分析メモ（2000 文字以内）`);

  return parts.join('\n\n---\n\n');
}

// Requirement 8.1: analyzeTurn 関数
export async function analyzeTurn(input: {
  transcript: string;
  currentPattern?: CurrentPattern;
  history: TurnHistory[];
  ctx: LlmContext;
}): Promise<LlmAnalysis> {
  const { ctx } = input;

  // Requirement 8.11: transcript サイズ上限 enforce
  const truncatedTranscript = input.transcript.slice(0, TRANSCRIPT_LIMIT);

  // Requirement 8.11: history サイズ上限 enforce（古い履歴を打ち切る）
  const truncatedHistory = truncateHistory(input.history);

  const prompt = buildPrompt(truncatedTranscript, input.currentPattern, truncatedHistory);

  // Requirement 8.10, 9.2: generateObject + Zod スキーマで structured output。
  // buildSystemPrompt には ctx の実値を渡す（ダミー禁止）。
  // ctx.currentPattern が設定されていれば優先、なければ input.currentPattern を流用する。
  const systemPrompt = buildSystemPrompt({
    interviewerProfile: ctx.interviewerProfile,
    candidateInfo: ctx.candidateInfo,
    plannedPatterns: ctx.plannedPatterns,
    completedCoverage: ctx.completedCoverage,
    currentPattern: ctx.currentPattern ?? input.currentPattern,
  });

  const { object } = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
    schema: analyzeTurnOutputSchema,
    prompt,
    maxRetries: 2,
  });

  // Requirement 8.12: validateAndFallback で Zod 検証、失敗時は SAFE_LLM_ANALYSIS_FALLBACK を返す。
  // SAFE_LLM_ANALYSIS_FALLBACK は M3 修正で analyzeTurnOutputSchema の全フィールドを満たすようになっている。
  const validated = validateAndFallback(
    object,
    analyzeTurnOutputSchema,
    SAFE_LLM_ANALYSIS_FALLBACK,
    'analyzeTurn',
  );

  // M4: LlmAnalysis 型に matched_pattern_id / stuck_signal が含まれるようになったので、
  // Zod 出力をそのまま LlmAnalysis として返せる（不要な型キャストなし）。
  return validated;
}

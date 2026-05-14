// Requirements 8.4, 8.5, 8.10, 8.11, 8.12, 12.7, 13.4
// _Boundary: ProposeNextQuestions_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import type { LlmContext } from '../lib/create-llm-context';
import { validateAndFallback, SAFE_PROPOSAL_FALLBACK } from '../lib/validate-llm-output';

// Requirement 8.4, 8.5, 13.4: proposeOutputSchema — 3 候補のうち最低 1 つは next_pattern intent
export const proposeOutputSchema = z.object({
  candidates: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        intent: z.enum(['deep_dive', 'meta_cognition', 'next_pattern']),
        pattern_id: z.string().optional(),
      }),
    )
    .length(3)
    .refine(
      (cs) => cs.some((c) => c.intent === 'next_pattern'),
      { message: '3 候補のうち最低 1 つは next_pattern intent を含む必要があります' },
    ),
});

function buildPrompt(input: {
  sessionState: { turnCount: number; elapsedMinutes: number };
  plannedPatterns: Array<{ code: string; title: string; category: string }>;
  completed: Array<{ pattern_code: string; level_reached: number; stuck_type?: string | null }>;
}): string {
  const parts: string[] = [];

  // セッション状態
  parts.push(
    `## セッション状態\n` +
      `- ターン数: ${input.sessionState.turnCount}\n` +
      `- 経過時間: ${input.sessionState.elapsedMinutes} 分`,
  );

  // 予定パターン一覧
  const plannedList =
    input.plannedPatterns.length > 0
      ? input.plannedPatterns
          .map((p) => `  - [${p.code}] ${p.title}（${p.category}）`)
          .join('\n')
      : '  （予定パターンなし）';
  parts.push(`## 予定パターン\n${plannedList}`);

  // 完了済みパターン
  const completedList =
    input.completed.length > 0
      ? input.completed
          .map((c) => {
            const stuckNote = c.stuck_type ? `（詰まり: ${c.stuck_type}）` : '';
            return `  - ${c.pattern_code}: L${c.level_reached}まで完了${stuckNote}`;
          })
          .join('\n')
      : '  （まだ完了したパターンはありません）';
  parts.push(`## 完了済みパターン\n${completedList}`);

  // タスク指示
  parts.push(
    `## タスク\n` +
      `上記のセッション状態・予定パターン・完了済みパターンをもとに、面接官への次の質問候補を **正確に 3 つ** 提案してください。\n\n` +
      `### 制約（必須）\n` +
      `- 3 候補を必ず返すこと（それ以上でも以下でもない）\n` +
      `- **3 候補のうち必ず 1 つ以上は intent を "next_pattern" にすること**（未完了のパターンへの移行を促す質問）\n` +
      `- 残り 2 候補は "deep_dive"（現パターンの深掘り）または "meta_cognition"（自己認識・振り返り）を選択する\n` +
      `- Requirement 12.7: AI横断軸（AI活用・AIリテラシー）を自然に差し込む候補を、必要に応じて "meta_cognition" または "deep_dive" として含めること\n\n` +
      `### 出力形式\n` +
      `JSON で以下を返してください：\n` +
      `- candidates: 3 要素の配列\n` +
      `  - text: 質問テキスト（日本語、1〜500 文字）\n` +
      `  - intent: "deep_dive" | "meta_cognition" | "next_pattern"\n` +
      `  - pattern_id: next_pattern の場合は対象パターンコード（任意）`,
  );

  return parts.join('\n\n---\n\n');
}

// Requirement 8.4: proposeNextQuestions 関数 — 3 候補（text + intent）を返す
export async function proposeNextQuestions(input: {
  sessionState: { turnCount: number; elapsedMinutes: number };
  plannedPatterns: Array<{ code: string; title: string; category: string }>;
  completed: Array<{ pattern_code: string; level_reached: number; stuck_type?: string | null }>;
  ctx: LlmContext;
}): Promise<{
  candidates: Array<{
    text: string;
    intent: 'deep_dive' | 'meta_cognition' | 'next_pattern';
    pattern_id?: string;
  }>;
}> {
  const prompt = buildPrompt({
    sessionState: input.sessionState,
    plannedPatterns: input.plannedPatterns,
    completed: input.completed,
  });

  // Requirement 8.10: generateObject + Zod で structured output
  // システムプロンプトで「3 候補のうち 1 つは必ず next_pattern」を明示
  const system =
    'あなたは面接支援アシスタントです。' +
    '面接官に対して次の質問候補を 3 つ提案してください。' +
    '必ず 1 つは intent を "next_pattern"（未完了パターンへの移行）にしてください。' +
    '出力は日本語で行い、採用可否の判断は含めないでください。';

  const { object } = await generateObject({
    model: claudeSonnet46,
    system,
    schema: proposeOutputSchema,
    prompt,
    maxRetries: 2,
  });

  // Requirement 8.12: validateAndFallback で検証、失敗時は SAFE_PROPOSAL_FALLBACK
  const validated = validateAndFallback(
    object,
    proposeOutputSchema,
    SAFE_PROPOSAL_FALLBACK,
    'proposeNextQuestions',
  );

  return validated;
}

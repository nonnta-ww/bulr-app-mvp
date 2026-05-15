// Requirements 8.4, 8.5, 8.10, 8.11, 8.12, 9.4, 12.7, 13.4, 18.2
// _Boundary: ProposeNextQuestions_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import { buildSystemPrompt } from '../prompts/system-prompt';
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
// Requirement D4: completed は ctx.completedCoverage から構築する（呼び出し側でハードコードしない）
export async function proposeNextQuestions(input: {
  sessionState: { turnCount: number; elapsedMinutes: number };
  ctx: LlmContext;
}): Promise<{
  candidates: Array<{
    text: string;
    intent: 'deep_dive' | 'meta_cognition' | 'next_pattern';
    pattern_id?: string;
  }>;
}> {
  const { ctx } = input;

  // ctx から planned/completed を派生（D4: ハードコード排除）
  const plannedPatterns = ctx.plannedPatterns.map((p) => ({
    code: p.code,
    title: p.title,
    category: p.category,
  }));
  const completed = ctx.completedCoverage.map((c) => ({
    pattern_code: c.pattern_code,
    level_reached: c.level_reached,
    stuck_type: c.evaluation?.stuck_type ?? null,
  }));

  const prompt = buildPrompt({
    sessionState: input.sessionState,
    plannedPatterns,
    completed,
  });

  // Requirement 9.4, 18.2: buildSystemPrompt を必ず system に渡す
  // （アドホック system 文字列は削除。採用推奨禁止 / インジェクション防御は Section 2/13 に含まれる）
  const systemPrompt = buildSystemPrompt({
    interviewerProfile: ctx.interviewerProfile,
    candidateInfo: ctx.candidateInfo,
    plannedPatterns: ctx.plannedPatterns,
    completedCoverage: ctx.completedCoverage,
    currentPattern: ctx.currentPattern,
  });

  // Requirement 8.10: generateObject + Zod で structured output
  const { object } = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
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

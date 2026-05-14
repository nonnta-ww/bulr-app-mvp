// Requirements 8.3, 8.10, 8.11, 8.12, 25.1, 25.4, 25.5
// _Boundary: SplitInterviewerCandidate_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import type { LlmContext } from '../lib/create-llm-context';

// Requirement 8.10: splitOutputSchema を Zod で定義
export const splitOutputSchema = z.object({
  interviewer_text: z.string().max(5000),
  candidate_text: z.string().max(10000),
});

// Requirement 8.11: transcript サイズ上限
const TRANSCRIPT_LIMIT = 10000;

function buildPrompt(transcript: string, questionTextHint: string | null | undefined): string {
  const parts: string[] = [];

  parts.push(`## 文字起こし\n${transcript}`);

  // Requirement 25.4: questionTextHint が non-null の場合は質問テキストヒントを提供する
  if (questionTextHint != null) {
    parts.push(
      `## 質問テキストヒント\n質問テキスト: 「${questionTextHint}」を interviewer_text に分類してください。`,
    );
  } else {
    // Requirement 25.1: manual ターンでも分離を行う
    parts.push(`## タスク\n面接官の発話と候補者の発話を分離してください。`);
  }

  parts.push(`## タスク
上記の文字起こしを分析し、以下を JSON で返してください：
- interviewer_text: 面接官の発話テキスト（5000 文字以内）
- candidate_text: 候補者の発話テキスト（10000 文字以内）`);

  return parts.join('\n\n---\n\n');
}

// Requirement 8.3: splitInterviewerCandidate 関数
// Requirement 25.1: 全ターンで呼ばれる（manual/非 manual を問わず）
export async function splitInterviewerCandidate(input: {
  transcript: string;
  questionTextHint?: string | null;
  ctx: LlmContext;
}): Promise<{ interviewer_text: string; candidate_text: string }> {
  // Requirement 8.11: transcript サイズ上限 enforce
  const truncatedTranscript = input.transcript.slice(0, TRANSCRIPT_LIMIT);

  const prompt = buildPrompt(truncatedTranscript, input.questionTextHint);

  try {
    // Requirement 8.10: generateObject + Zod スキーマで structured output
    const { object } = await generateObject({
      model: claudeSonnet46,
      schema: splitOutputSchema,
      prompt,
      maxRetries: 2,
    });

    return {
      interviewer_text: object.interviewer_text,
      candidate_text: object.candidate_text,
    };
  } catch (err) {
    // Requirement 8.12, 25.5: 失敗時はフォールバック + console.warn ログ
    console.warn(
      '[splitInterviewerCandidate] LLM call failed, using fallback:',
      err,
    );
    return {
      interviewer_text: '',
      candidate_text: input.transcript,
    };
  }
}

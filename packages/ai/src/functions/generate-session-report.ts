// Requirements 8.7, 8.10, 8.12, 11.5, 12.5, 13.6
// _Boundary: GenerateSessionReport_
// v2 (2026-05-18 redesign): LLM は summary_text のみ生成。heatmap_data はコード側で aggregateHeatmap が算出。

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import { buildSystemPrompt } from '../prompts/system-prompt';
import type { LlmContext } from '../lib/create-llm-context';
import { validateAndFallback } from '../lib/validate-llm-output';
import type { PatternCoverage, InterviewTurn } from '@bulr/db/schema';

const SUMMARY_TEXT_LIMIT = 10000;

export const summaryOutputSchema = z.object({
  summary_text: z.string().max(SUMMARY_TEXT_LIMIT),
});

const SAFE_SUMMARY_FALLBACK = {
  summary_text: 'レポート生成失敗、面接官は管理画面で原データを確認してください',
};

function buildPrompt(allCoverage: PatternCoverage[], freeQuestions: InterviewTurn[]): string {
  const parts: string[] = [];

  const coverageSummary = allCoverage
    .map((c) => {
      const e = c.llm_evaluation;
      return [
        `パターンID: ${c.pattern_id}`,
        `  到達レベル: ${c.level_reached}`,
        `  詰まりタイプ: ${c.stuck_type ?? 'なし'}`,
        `  authenticity: ${e.authenticity}`,
        `  judgment: ${e.judgment}`,
        `  scope: ${e.scope}`,
        `  meta_cognition: ${e.meta_cognition}`,
        `  ai_literacy: ${e.ai_literacy}`,
        `  メモ: ${e.notes}`,
      ].join('\n');
    })
    .join('\n\n');

  parts.push(`## 全パターンカバレッジ（${allCoverage.length} パターン）\n${coverageSummary || '（データなし）'}`);

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

  const freeQuestionsSectionInstruction =
    freeQuestions.length > 0
      ? '`## フリー質問総評` セクションを必ず含め、観察された傾向を箇条書きまたは短い段落で記述してください。'
      : '`## フリー質問総評` セクションは省略してください（フリー質問が無いため）。';

  parts.push(`## タスク
候補者の面接観察事実を簡潔にまとめた summary_text（10000 文字以内）を **Markdown 形式** で生成し、JSON で返してください。

### 出力フォーマット（厳守）
以下の固定スケルトンに沿って出力すること。見出しレベルは \`##\` から始め、\`#\` (h1) は使わない（ページ側の h1 と重複するため）。箇条書きは \`-\` を使い、番号付きリストは使わない。重要な観察事実のみ \`**bold**\` で控えめに強調可（多用しない）。

\`\`\`markdown
## 評価軸別所感

### Authenticity
- （観察された具体事実）
- （観察された具体事実）

### Judgment
- ...

### Scope
- ...

### Meta cognition
- ...

### AI literacy
- ...

## カテゴリ別カバレッジ

- **{カテゴリ名}**: （観察された到達状況・詰まり状況）
- **{カテゴリ名}**: ...

## フリー質問総評

- （観察された事実 / 全体の傾向）
\`\`\`

${freeQuestionsSectionInstruction}

### 内容要件
- 5 次元別所感は、数値の単純引用ではなくターンから観察された具体的な事実を記述する。
- カテゴリ別カバレッジは、各カテゴリの到達状況・詰まり状況を端的に列挙する。
- 採用推奨・不採用推奨・「中堅水準」「強み/弱み」のような評価ラベルは出さない（観察事実のみ）。`);

  return parts.join('\n\n---\n\n');
}

const SESSION_REPORT_SUPPLEMENT = `# レポート生成タスク固有の指示

## 出力形式
summary_text は **Markdown 形式** で出力すること。見出し（\`##\` / \`###\`）と箇条書き（\`-\`）を使い、面接官が視覚的にセクションを区別できる構造にすること。詳細フォーマットはユーザープロンプトの「出力フォーマット」を参照。

## フリー質問の扱い
フリー質問（pattern_id が null のターン）がある場合は、\`## フリー質問総評\` セクションを別途設け、観察された傾向を記述する。フリー質問が無い場合はセクション自体を省略する。

## 出力内容
- 候補者の観察事実の客観的な要約
- 5 次元別所感（観察された具体事実ベース）
- カテゴリ別のカバレッジ所感
- フリー質問の総評（ある場合）
- 採用可否に関わる判定や「強み/弱み」「中堅水準」のような評価ラベルを含めない`;

// Requirement 8.7: generateSessionReport
export async function generateSessionReport(input: {
  allCoverage: PatternCoverage[];
  freeQuestions: InterviewTurn[];
  ctx: LlmContext;
}): Promise<{ summary_text: string }> {
  const { ctx } = input;
  const prompt = buildPrompt(input.allCoverage, input.freeQuestions);

  const baseSystemPrompt = buildSystemPrompt({
    interviewerProfile: ctx.interviewerProfile,
    candidateInfo: ctx.candidateInfo,
    plannedPatterns: ctx.plannedPatterns,
    completedCoverage: ctx.completedCoverage,
    currentPattern: ctx.currentPattern,
  });
  const systemPrompt = `${baseSystemPrompt}\n\n---\n\n${SESSION_REPORT_SUPPLEMENT}`;

  const { object } = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
    schema: summaryOutputSchema,
    prompt,
    maxRetries: 2,
  });

  const validated = validateAndFallback(
    object,
    summaryOutputSchema,
    SAFE_SUMMARY_FALLBACK,
    'generateSessionReport',
  );

  return {
    summary_text: validated.summary_text.slice(0, SUMMARY_TEXT_LIMIT),
  };
}

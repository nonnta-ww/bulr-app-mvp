// Requirements: 3.1, 3.2, 3.3, 3.4
// _Boundary: AIパッケージ (@bulr/ai-self-analysis) — @bulr/db 非依存_

import { generateObject } from 'ai';
import { claudeSonnet46 } from '@bulr/ai';
import {
  selfAnalysisNarrativeSchema,
  type SelfAnalysisGenInput,
  type SelfAnalysisGenResult,
} from './schema';

// ──────────────────────────────────────────────
// プロンプトビルダー
// ──────────────────────────────────────────────

/**
 * Grounding 制約 (a)(b)(c) を組み込んだ system プロンプトを構築する。
 * design.md §packages/ai — @bulr/ai-self-analysis の Grounding（回答内容への限定・R3.3）に準拠。
 */
function buildSystemPrompt(jobType: string): string {
  return `あなたは候補者の skill-survey 回答を読み、その候補者の強み・弱み・成長アクションを整理するコーチです。

## 役割
候補者が skill-survey（スキルアンケート）に入力した回答をもとに、自己成長の起点となる自己分析（強み・弱み・成長アクション）を提供してください。

## 対象職種
${jobType}

## 絶対に守るべき制約

### (a) 回答内容への根拠づけ（Grounding）
- 強みは、**入力に存在する選択ラベルまたは自由記述に紐づけて**言及してください。
- 回答に存在しないスキル・経験・資質を断定的に述べてはいけません。
- 「この候補者は〜が得意」「〜の能力がある」と述べる場合は、必ず入力された回答（選択ラベルまたは自由記述）に対応する根拠を持ってください。

### (b) 弱み・手薄領域の記述方針
- 弱みや手薄な領域は、「未選択・低網羅・自由記述の薄さ」として記述してください。
- 回答が少ない・空白が多いという観察事実に基づいて述べ、能力の欠如を憶測で断定しないでください。
- 「〜が弱い」ではなく「〜についての回答が少なく、手薄な可能性がある」のような表現を使ってください。

### (c) 数値スコア・他者比較・順位付けの禁止
- 数値スコア・偏差値・パーセンタイル・評点などの数値による評価を一切含めないでください。
- 「平均より高い」「上位〇%」「他の候補者と比べて」などの他者比較・順位付けを含めないでください。
- 自己内の成長・変化・傾向のみを扱ってください。

## 出力の指針
- 出力に含めてよい根拠は、この入力に存在する選択ラベルと自由記述のみです。外部知識・職種一般論・他候補者データを根拠にしないでください。
- 根拠が入力に見当たらない内容は、断定を避け growthActions（次の一歩）側に寄せてください（強みの捏造より保守的に倒す）。
- 各項目は日本語で記述してください。`;
}

/**
 * 回答文脈（選択ラベル・自由記述）と集計（網羅度）のみをプロンプトに渡す。
 * 外部知識・他候補者データは含めない（Grounding R3.3）。
 */
function buildPrompt(input: SelfAnalysisGenInput): string {
  const parts: string[] = [];

  // ─── 網羅度サマリ ───
  const coverageLines = input.aggregated.categories.map((cat) => {
    const pct = Math.round(cat.coverageRatio * 100);
    const breadthNote = cat.selectedBreadth > 0 ? `選択数: ${cat.selectedBreadth}` : '選択なし';
    const freeNote = cat.freeTextPresence ? '自由記述: あり' : '自由記述: なし';
    return `  - ${cat.categoryName}: 回答 ${cat.answeredQuestions}/${cat.totalQuestions} 問（${pct}%）、${breadthNote}、${freeNote}`;
  });

  parts.push(
    `## 回答の網羅度サマリ\n全体網羅度: ${Math.round(input.aggregated.overallCoverageRatio * 100)}%\n${coverageLines.join('\n')}`,
  );

  // ─── 回答詳細（選択ラベル + 自由記述） ───
  if (input.answers.length > 0) {
    const answerLines = input.answers.map((a) => {
      const labels =
        a.selectedLabels.length > 0
          ? `選択: ${a.selectedLabels.join(' / ')}`
          : '選択: なし';
      const free = a.freeText ? `自由記述: ${a.freeText}` : '自由記述: なし';
      return `  【${a.categoryName}】${a.questionBody}\n    ${labels}\n    ${free}`;
    });
    parts.push(`## 回答詳細\n${answerLines.join('\n\n')}`);
  } else {
    parts.push(`## 回答詳細\n（回答データがありません）`);
  }

  parts.push(`## タスク
上記の回答内容のみを根拠として、以下を出力してください。

- strengths: 入力に存在する選択ラベル・自由記述に紐づいた強み（文字列配列、各 max 300 字）
- weaknesses: 未選択・低網羅・自由記述の薄さから見られる手薄な領域（文字列配列、各 max 300 字）
- growthActions: 次に伸ばすべき点・具体的な次の一歩（文字列配列、各 max 500 字）

各要素は数値スコア・他者比較・順位付けを含めず、日本語で記述してください。`);

  return parts.join('\n\n---\n\n');
}

// ──────────────────────────────────────────────
// メイン関数
// ──────────────────────────────────────────────

/**
 * 要件 3.1, 3.2, 3.3, 3.4:
 * 集計スナップショット＋回答文脈から強み・弱み・成長アクションを structured output で生成する。
 *
 * - 入力は当該候補者の回答由来データのみ（Grounding R3.3）
 * - system プロンプトに Grounding 制約 (a)(b)(c) を明記
 * - 出力は文字列配列のみ（数値スコア・他者比較フィールドなし、R3.4）
 * - generateObject + Zod で形を保証（maxRetries: 2）
 * - { output, usage } を返す（@bulr/ai-mock パターン踏襲）
 */
export async function generateSelfAnalysisNarrative(
  input: SelfAnalysisGenInput,
): Promise<SelfAnalysisGenResult> {
  const systemPrompt = buildSystemPrompt(input.jobType);
  const prompt = buildPrompt(input);

  const result = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
    schema: selfAnalysisNarrativeSchema,
    prompt,
    maxRetries: 2,
  });

  return {
    output: result.object,
    usage: {
      input_tokens: result.usage.inputTokens ?? 0,
      output_tokens: result.usage.outputTokens ?? 0,
    },
  };
}

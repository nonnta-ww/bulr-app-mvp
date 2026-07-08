// Requirements: 7.1, 7.2, 4.3
// _Boundary: AIパッケージ (@bulr/ai-class-diagnosis) — 契約型は @bulr/types 由来_

import { generateObject } from 'ai';
import { claudeSonnet46 } from '@bulr/ai';
import type { TemperamentSummary } from '@bulr/types';
import {
  classFlavorSchema,
  type ClassFlavorInput,
  type ClassFlavorGenResult,
} from './schema';

/**
 * 気質サマリを、app-local ラベルに依存せず @bulr/types のトークン（極 token・code・balanced 軸）
 * のみで言葉化する。数値は一切含めない（Grounding R7.2）。
 * app-local の日本語ラベルはここでは import できないため、確定した極トークンを語彙として渡す。
 */
export function describeTemperament(
  temperament: TemperamentSummary | null,
): string {
  if (temperament === null || temperament.completeness === 'none') {
    return '未確定';
  }
  const parts: string[] = [];
  const poleTokens = Object.values(temperament.poles);
  if (poleTokens.length > 0) {
    parts.push(`確定した気質傾向: ${poleTokens.join(' / ')}`);
  }
  if (temperament.balancedAxes.length > 0) {
    parts.push(`拮抗（バランス）軸: ${temperament.balancedAxes.join(' / ')}`);
  }
  if (temperament.code !== null) {
    parts.push(`気質コード: ${temperament.code}`);
  }
  return parts.length > 0 ? parts.join('、') : '未確定';
}

// ──────────────────────────────────────────────
// プロンプトビルダー（純関数・テスト可能）
// ──────────────────────────────────────────────

/**
 * Grounding 制約 (a)(b)(c) を組み込んだ system プロンプトを構築する。
 * design.md §packages/ai — generate-class-flavor.ts の Grounding（回答内容への限定・R7.2）に準拠。
 */
export function buildClassFlavorSystemPrompt(): string {
  return `あなたは候補者のスキルアンケート回答から確定した「RPGクラス」を、物語的なフレーバー文で表現するナレーターです。

## 役割
候補者の職掌・気質・称号と、その根拠となった回答（選択ラベル・自由記述）をもとに、そのクラスの世界観を表すキャッチコピー（tagline）・説明文（description）・次の一歩のヒント（nextStepHint）を生成してください。

## 絶対に守るべき制約

### (a) 回答内容への根拠づけ（Grounding）
- フレーバー文は、**入力に存在するクラス判定（職掌・気質・称号）と選択ラベル・自由記述に紐づけて**表現してください。
- 回答に存在しないスキル・経験・資質を断定的に述べてはいけません。
- 入力された回答（選択ラベルまたは自由記述）に対応する根拠を持って記述してください。

### (b) 支援的なフレーミング
- クラスは候補者の現在の傾向を肯定的・支援的に描写してください。
- 弱点や欠如の断定ではなく、成長の余地・次に向かう方向として前向きに表現してください。

### (c) 数値スコア・他者比較・順位付けの禁止
- 数値スコア・偏差値・パーセンタイル・評点などの数値による評価を一切含めないでください。
- 「平均より高い」「上位〇%」「他の候補者と比べて」などの他者比較・順位付けを含めないでください。
- 自己内の傾向・成長・変化のみを扱ってください。

## 出力の指針
- 出力に含めてよい根拠は、この入力に存在するクラス判定（言葉としての職掌・気質・称号）と選択ラベル・自由記述のみです。外部知識・職種一般論・他候補者データを根拠にしないでください。
- nextStepHint は、隣接するクラスへの成長（現在の強みを起点に次に広げる/深める方向）を1つ示唆してください（R4.3）。
- 各項目は日本語で、指定文字数以内で記述してください。`;
}

/**
 * クラス判定（result）を LABELS のみで質的に記述し、回答文脈を渡す。
 * 数値 vocationVector 値・confidence・パーセンテージは一切含めない（Grounding R7.2）。
 */
export function buildClassFlavorPrompt(input: ClassFlavorInput): string {
  const { result, answers } = input;
  const parts: string[] = [];

  // ─── クラス判定（言葉のみ・数値なし） ───
  const classLines: string[] = [
    `クラス名: ${result.className}`,
    `主職掌: ${result.primaryVocation}`,
    `副職掌: ${result.subVocations.length > 0 ? result.subVocations.join(' / ') : 'なし'}`,
    `気質: ${describeTemperament(result.temperament)}`,
    `称号: ${result.title}`,
    `代表職掌: ${result.representativeVocation}`,
  ];
  parts.push(`## クラス判定\n${classLines.join('\n')}`);

  // ─── 根拠となった回答（選択ラベル + 自由記述） ───
  if (answers.length > 0) {
    const answerLines = answers.map((a) => {
      const labels =
        a.selectedLabels.length > 0
          ? `選択: ${a.selectedLabels.join(' / ')}`
          : '選択: なし';
      const free = a.freeText ? `自由記述: ${a.freeText}` : '自由記述: なし';
      return `  【${a.categoryName}】\n    ${labels}\n    ${free}`;
    });
    parts.push(`## 根拠となった回答\n${answerLines.join('\n\n')}`);
  } else {
    parts.push(`## 根拠となった回答\n（回答データがありません）`);
  }

  parts.push(`## タスク
上記のクラス判定（言葉）と回答内容のみを根拠として、以下を出力してください。

- tagline: このクラスを象徴するキャッチコピー（max 80 字）
- description: クラスの世界観と候補者の傾向を根拠づけて描く説明文（max 400 字）
- nextStepHint: 隣接クラスへの成長（次に広げる/深める方向）を示すヒント（max 200 字）

数値スコア・他者比較・順位付けを含めず、日本語で記述してください。`);

  return parts.join('\n\n---\n\n');
}

// ──────────────────────────────────────────────
// メイン関数
// ──────────────────────────────────────────────

/**
 * 要件 7.1, 7.2, 4.3:
 * ClassResult ＋ 回答ラベルから tagline/description/nextStepHint を structured output で生成する。
 *
 * - 入力は当該候補者のクラス判定（言葉）と回答由来ラベルのみ（Grounding R7.1）
 * - system プロンプトに Grounding 制約 (a)(b)(c)（数値スコア・他者比較・順位付け禁止）を明記（R7.2）
 * - nextStepHint は隣接クラスへの成長を示唆（R4.3）
 * - 数値 vocationVector 値はプロンプトに含めない
 * - generateObject + Zod で形を保証（maxRetries: 2）
 * - LLM 失敗時のフォールバックは呼び出し側（task 7）が処理する
 */
export async function generateClassFlavor(
  input: ClassFlavorInput,
): Promise<ClassFlavorGenResult> {
  const system = buildClassFlavorSystemPrompt();
  const prompt = buildClassFlavorPrompt(input);

  const result = await generateObject({
    model: claudeSonnet46,
    system,
    schema: classFlavorSchema,
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

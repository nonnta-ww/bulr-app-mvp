// Requirements: 要件4, 要件9
// _Boundary: AIパッケージ (@bulr/ai-mock)_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46, validateAndFallback } from '@bulr/ai';
import { type TurnItem } from './conduct-mock-interview';

// ──────────────────────────────────────────────
// Zod スキーマ
// ──────────────────────────────────────────────

/**
 * 要件4, 要件4-3: 形成的フィードバックの出力スキーマ。
 * 5 次元 + 総合 — すべて定性的文章（数値スコアなし）。
 * FormativeFeedback (packages/db) と同一の構造。
 */
export const generateFormativeFeedbackOutputSchema = z.object({
  /** 真贋（Authenticity）: 回答の具体性・実体験の確からしさ */
  authenticity: z.string(),
  /** 判断力（Judgment）: 状況に応じた意思決定の質 */
  judgment: z.string(),
  /** 射程（Scope）: 判断・経験の汎化可能性・視野の広さ */
  scope: z.string(),
  /** メタ認知（Meta-cognition）: 自己の思考・行動への洞察力 */
  meta_cognition: z.string(),
  /** AI 活用リテラシー（AI Literacy）: AI ツールとの協働姿勢と理解度 */
  ai_literacy: z.string(),
  /** 総合所感（Overall）: 5 次元を統合した全体的な成長方向性 */
  overall: z.string(),
});

export type GenerateFormativeFeedbackOutput = z.infer<
  typeof generateFormativeFeedbackOutputSchema
>;

// ──────────────────────────────────────────────
// セーフフォールバック
// ──────────────────────────────────────────────

const SAFE_FORMATIVE_FEEDBACK_FALLBACK: GenerateFormativeFeedbackOutput = {
  authenticity:
    '今回の回答では、具体的なエピソードの詳細を引き出すことができませんでした。次の機会では、実際に関わった状況・役割・結果をより具体的に言語化することを意識すると、経験の実体が伝わりやすくなるでしょう。',
  judgment:
    '判断の根拠や優先順位づけのプロセスについて、さらに深掘りする余地が見受けられました。「なぜその選択をしたのか」を問い直す習慣を持つと、意思決定の質がより明確に示せるようになるでしょう。',
  scope:
    '今回の経験を他のコンテキストへ応用する視点について、まだ探求の余地があります。類似する状況でどう応用できるかを意識的に考えることで、経験の射程をさらに広げることができるでしょう。',
  meta_cognition:
    '自身の思考プロセスや行動パターンへの内省がさらに深まると、成長の加速につながります。振り返りの際に「なぜそう考えたのか」「次回はどう変えるか」を言語化する習慣を大切にしてください。',
  ai_literacy:
    'AI ツールとの協働について、具体的な活用事例や判断基準をさらに言語化できると強みが伝わりやすくなります。どの場面でどのように AI を取り入れ、何を自分で判断したかを整理してみましょう。',
  overall:
    '今回の模擬面接お疲れさまでした。各次元の振り返りを参考に、次の実践の場でさらなる成長を目指してください。（※フィードバック生成中にエラーが発生したため、暫定フォールバックを表示しています）',
};

// ──────────────────────────────────────────────
// インターフェース定義
// ──────────────────────────────────────────────

export interface GenerateFormativeFeedbackInput {
  pattern: {
    code: string;
    title: string;
    description: string;
    level_1_intro: string;
    level_2_focus: string;
    level_3_focus: string;
    level_4_focus: string;
    ai_perspective: string;
    signals: string[];
  };
  history: TurnItem[];
}

export interface GenerateFormativeFeedbackResult {
  output: GenerateFormativeFeedbackOutput;
  usage: { input_tokens: number; output_tokens: number };
}

// ──────────────────────────────────────────────
// プロンプトビルダー
// ──────────────────────────────────────────────

const HISTORY_TOTAL_LIMIT = 80_000;

function truncateHistory(history: TurnItem[]): TurnItem[] {
  const result: TurnItem[] = [];
  let totalChars = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i]!;
    const chars = turn.content.length;
    if (totalChars + chars > HISTORY_TOTAL_LIMIT) break;
    result.unshift(turn);
    totalChars += chars;
  }
  return result;
}

function buildSystemPrompt(
  pattern: GenerateFormativeFeedbackInput['pattern'],
): string {
  const signalsList = pattern.signals.map((s) => `  - ${s}`).join('\n');

  return `あなたは bulr（エンジニア採用プラットフォーム）の AI フィードバックコーチです。
模擬面接の会話全体を読み、候補者に形成的フィードバック（成長促進を目的とした定性的フィードバック）を提供してください。

## フィードバックの原則（bulr スタイル）
- 数値スコアは一切使用しない
- 「良い・悪い」「強み・弱み」等の評価ラベルを避ける
- 「〜が観察されました」「〜という姿勢が見受けられます」等の観察ベースの記述を使う
- 成長方向を示す際は「次は〜を意識すると良いでしょう」「〜することで、さらに〜が伝わります」等の前向きな表現を使う
- 各次元は独立した段落として記述し、具体的な発言や行動パターンへの言及を含める

## 評価パターン情報
コード: ${pattern.code}
タイトル: ${pattern.title}
説明: ${pattern.description}

## 4 段階深掘り構造
### Level 1（状況把握）
${pattern.level_1_intro}

### Level 2（判断理由の深掘り）
${pattern.level_2_focus}

### Level 3（結果・学びの確認）
${pattern.level_3_focus}

### Level 4（汎化・メタ認知）
${pattern.level_4_focus}

## AI 視点の問い（ai_perspective）
${pattern.ai_perspective}

## 観察シグナル（signals）
${signalsList}

## 5 次元フィードバックルーブリック

### 1. 真贋（authenticity）
定義: 回答の具体性・実体験の確からしさ
観察ポイント:
  - 実際の経験に基づいた固有名詞・数値・時系列が含まれているか
  - 一般論や理想論ではなく、自身が直面した具体的状況を語れているか
  - 面接官の掘り下げ質問に対して一貫した詳細を提供できているか

### 2. 判断力（judgment）
定義: 状況に応じた意思決定の質
観察ポイント:
  - 複数の選択肢を考慮した上での判断プロセスが見えるか
  - 判断の根拠・優先順位・トレードオフを言語化できているか
  - 制約条件や不確実性の中での意思決定能力が示されているか

### 3. 射程（scope）
定義: 判断・経験の汎化可能性・視野の広さ
観察ポイント:
  - 個別経験を一般化・パターン化して語れているか
  - チーム・組織・事業への影響を考慮した視点が示されているか
  - 異なるコンテキストへの応用可能性を意識しているか

### 4. メタ認知（meta_cognition）
定義: 自己の思考・行動への洞察力
観察ポイント:
  - 自身の判断の限界・バイアスを認識できているか
  - 失敗や改善点を内省的に語れているか
  - 経験から学ぶプロセスを言語化できているか

### 5. AI 活用リテラシー（ai_literacy）
定義: AI ツールとの協働姿勢と理解度
観察ポイント:
  - AI をどの場面でどのように活用したかを具体的に語れているか
  - AI の出力を批判的に評価・検証する姿勢があるか
  - 人間の判断と AI 支援の境界を意識的に扱えているか

## 出力形式
以下の 6 フィールドを日本語で記述してください（各フィールドは 150〜400 文字程度の段落）：
- authenticity: 真贋次元のフィードバック
- judgment: 判断力次元のフィードバック
- scope: 射程次元のフィードバック
- meta_cognition: メタ認知次元のフィードバック
- ai_literacy: AI 活用リテラシー次元のフィードバック
- overall: 5 次元を統合した総合的な成長方向性（200〜500 文字）`;
}

function buildPrompt(history: TurnItem[]): string {
  const parts: string[] = [];

  if (history.length > 0) {
    const historyText = history
      .map((t) => `${t.role === 'interviewer' ? '面接官' : '候補者'}: ${t.content}`)
      .join('\n');
    parts.push(`## 模擬面接の会話全文\n${historyText}`);
  } else {
    parts.push(`## 模擬面接の会話全文\n（会話記録がありません）`);
  }

  parts.push(`## タスク
上記の模擬面接全体を通じて、候補者への形成的フィードバックを 5 次元 + 総合（overall）の形式で生成してください。

各次元のフィードバックは：
1. 会話の中で観察された具体的な言動・発言パターンへの言及を含める
2. 数値スコアや評価ラベルを一切使用しない
3. 成長方向を示す前向きな表現で締めくくる
4. 候補者が次の実践でどこに意識を向けるべきかが伝わる内容にする`);

  return parts.join('\n\n---\n\n');
}

// ──────────────────────────────────────────────
// メイン関数
// ──────────────────────────────────────────────

/**
 * 要件4, 要件9: 模擬面接全体の形成的フィードバックを生成する。
 * - 5 次元（真贋・判断力・射程・メタ認知・AI 活用リテラシー）+ 総合
 * - generateObject + Zod で Structured output を保証
 * - validateAndFallback でセーフフォールバック
 * - 数値スコアなし（要件4-3）
 * - usage（input_tokens / output_tokens）を返す
 */
export async function generateFormativeFeedback(
  input: GenerateFormativeFeedbackInput,
): Promise<GenerateFormativeFeedbackResult> {
  const { pattern } = input;

  const truncatedHistory = truncateHistory(input.history);
  const systemPrompt = buildSystemPrompt(pattern);
  const prompt = buildPrompt(truncatedHistory);

  const result = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
    schema: generateFormativeFeedbackOutputSchema,
    prompt,
    maxRetries: 2,
  });

  const validated = validateAndFallback(
    result.object,
    generateFormativeFeedbackOutputSchema,
    SAFE_FORMATIVE_FEEDBACK_FALLBACK,
    'generateFormativeFeedback',
  );

  return {
    output: validated,
    usage: {
      input_tokens: result.usage.inputTokens ?? 0,
      output_tokens: result.usage.outputTokens ?? 0,
    },
  };
}

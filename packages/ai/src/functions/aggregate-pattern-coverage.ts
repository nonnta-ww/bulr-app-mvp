// Requirements 8.6, 8.10, 8.12, 13.2, 13.3, 13.5, 13.6
// _Boundary: AggregatePatternCoverage_

import { generateObject } from 'ai';
import { z } from 'zod';
import { claudeSonnet46 } from '../client';
import { buildSystemPrompt } from '../prompts/system-prompt';
import type { LlmContext } from '../lib/create-llm-context';
import { validateAndFallback, SAFE_LLM_EVALUATION_FALLBACK } from '../lib/validate-llm-output';
import type { LlmEvaluation } from '@bulr/types/evaluation';
import type { InterviewTurn, AssessmentPattern } from '@bulr/db/schema';

// Requirement 13.2: 5次元スコアはすべて整数リテラル型で Zod 検証する
// Requirement 8.10: aggregateOutputSchema を Zod で定義
export const aggregateOutputSchema = z.object({
  authenticity: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  judgment: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  scope: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  meta_cognition: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  ai_literacy: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  level_reached: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  // Requirement 13.3: 詰まり判定（stuck_type）を記録する
  stuck_type: z.enum(['not_experienced', 'shallow', 'single_option', 'rigid']).nullable(),
  notes: z.string().max(5000),
  evaluated_at: z.string(),
});

// Requirement 8.11: transcript サイズ上限
const TRANSCRIPT_LIMIT = 10000;

function buildAggregatePrompt(
  turns: InterviewTurn[],
  pattern: AssessmentPattern,
): string {
  const parts: string[] = [];

  parts.push(
    `## 評価対象パターン\nID: ${pattern.id}\nコード: ${pattern.code}\nタイトル: ${pattern.title}\nカテゴリ: ${pattern.category}\n説明: ${pattern.description}\n期待スコープ範囲: ${pattern.expected_scope_min}〜${pattern.expected_scope_max}`,
  );

  if (turns.length > 0) {
    const turnsText = turns
      .map((t, i) => {
        const transcript = t.transcript as { interviewer?: string; candidate: string; raw: string };
        const candidateText = transcript.candidate.slice(0, TRANSCRIPT_LIMIT);
        return `### ターン ${i + 1}（序番: ${t.sequence_no}）\n質問: ${t.question_text}\n候補者発話: ${candidateText}`;
      })
      .join('\n\n');
    parts.push(`## 面接ターン一覧\n${turnsText}`);
  } else {
    parts.push(`## 面接ターン一覧\n（このパターンのターンはありません）`);
  }

  // Requirement 13.5: 詰まり検知時のスコアルールをプロンプトで明示
  parts.push(`## タスク
上記のすべての面接ターンを総合的に評価し、以下の JSON を返してください：

### 5次元スコア（整数リテラルのみ）
- authenticity（真正性）: 候補者の発話が具体的な実経験に基づいているか
  - 0: 経験の存在自体が確認できない／作り話の疑い
  - 1: 経験はあるが詳細が乏しく検証困難
  - 2: 具体的な経験があり概ね信頼できる
  - 3: 詳細で一貫した実経験が豊富に示された
- judgment（判断力）: 意思決定・トレードオフ思考の質
  - 0: 判断プロセスが全く語れない
  - 1: 単純な理由のみ・代替案なし
  - 2: 複数観点からの判断・一定のトレードオフ意識あり
  - 3: 高度なトレードオフ分析・複数代替案の比較検討
- scope（スコープ）: 経験・関与の規模（1〜5 の整数）
  - 1〜5: パターンの expected_scope_min〜expected_scope_max を参照して判断
- meta_cognition（メタ認知）: 自己の思考・行動への内省能力
  - 0: 振り返りや学びを全く述べられない
  - 1: 表面的な振り返りのみ
  - 2: 具体的な学びと他への応用
  - 3: 深い内省・思考プロセスの体系的理解
- ai_literacy（AIリテラシー）: AI活用の実践的理解
  - 0: AI活用経験・知識が確認できない
  - 1: 表面的な利用のみ・批判的評価なし
  - 2: 実践的活用と一定の批判的評価あり
  - 3: 高度な活用・AI出力の検証・プロンプト工夫

### 到達段階
- level_reached: 面接で到達した深掘り段階（0〜4 の整数）
  - 0: L0 経験なし・到達不可
  - 1: L1 状況確認のみ
  - 2: L2 判断理由まで確認
  - 3: L3 結果・学びまで確認
  - 4: L4 汎化・メタ認知まで確認

### 詰まり判定（Requirement 13.3）
- stuck_type: 候補者の詰まりタイプ（null の場合は詰まりなし）
  - null: 詰まりなし（スムーズに回答できた）
  - "not_experienced": 経験なし（このパターンの経験が全くない）
  - "shallow": 経験が浅い（L1 は答えられるが L2 以降が困難）
  - "single_option": 視野が狭い（代替案を考えられない・トレードオフ意識なし）
  - "rigid": 硬直した思考（文脈を無視して同じ解決策を適用する）

### 詰まり検知時のスコアルール（Requirement 13.5）
詰まりを検知した場合、以下のスコアルールを適用してください：
- stuck_type = "shallow" → authenticity を 0〜1 の範囲で評価する
  （経験の浅さは真正性の低さを示すため）
- stuck_type = "single_option" → judgment を 0〜1 の範囲で評価する
  （代替案・トレードオフを考えられないことは判断力の低さを示すため）
- stuck_type = "rigid" → meta_cognition を 0〜1 の範囲で評価する
  （硬直した思考はメタ認知能力の低さを示すため）

### 詰まり検知時のlevel_reachedルール（Requirement 13.3）
詰まりを検知した場合、以下のlevel_reachedを記録してください：
- stuck_type = "not_experienced" → level_reached = 0（経験なし、L0到達）
- stuck_type = "shallow" → level_reached = 1〜2 の範囲で評価する（L1-L2到達）
- stuck_type = "single_option" → level_reached = 2〜3 の範囲で評価する（L2-L3到達）
- stuck_type = "rigid" → level_reached = 3（L3到達、L4での硬直）

### その他
- notes: 評価根拠・特記事項（5000 文字以内）
- evaluated_at: 評価時刻（ISO 8601 形式: ${new Date().toISOString()}）

### 採用推奨禁止（Requirement 13.6）
notes に採用可否・採用推奨コメントを含めないでください。評価根拠と観察事実のみを記述してください。`);

  return parts.join('\n\n---\n\n');
}

// Requirement 8.6: aggregatePatternCoverage 関数を実装し、LlmEvaluation を返す
export async function aggregatePatternCoverage(input: {
  turns: InterviewTurn[];
  pattern: AssessmentPattern;
  ctx: LlmContext;
}): Promise<LlmEvaluation> {
  const { turns, pattern } = input;

  const prompt = buildAggregatePrompt(turns, pattern);

  // Requirement 8.10: generateObject + Zod structured output
  const systemPrompt = buildSystemPrompt({
    interviewerProfile: { displayName: 'Interviewer' },
    candidateInfo: { name: 'Candidate', appliedRole: '', backgroundSummary: '' },
    plannedPatterns: [],
    completedCoverage: [],
  });

  const { object } = await generateObject({
    model: claudeSonnet46,
    system: systemPrompt,
    schema: aggregateOutputSchema,
    prompt,
    maxRetries: 2,
  });

  // Requirement 8.12: validateAndFallback で検証、失敗時は SAFE_LLM_EVALUATION_FALLBACK を返す
  const validated = validateAndFallback(
    object,
    aggregateOutputSchema,
    SAFE_LLM_EVALUATION_FALLBACK,
    'aggregatePatternCoverage',
  );

  // evaluated_at は LLM 出力を信用せず、サーバ側で必ず上書きする（hallucination 防御）
  return {
    ...validated,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * SSE イベントスキーマ定義 — POST /api/interview/turns/next
 *
 * サーバー・クライアント間で共有する SSE イベントの Zod スキーマと TypeScript 型。
 * `@bulr/db` は type-only import のみ使用し、クライアントバンドルへの
 * DB ランタイムコード（drizzle-orm 接続コード等）の混入を防ぐ。
 *
 * Requirements: 1.5, 3.1
 */

import { z } from 'zod';
import type { schema } from '@bulr/db';

// ---------------------------------------------------------------------------
// Drizzle 推論型エイリアス（type-only — バンドルには含まれない）
// ---------------------------------------------------------------------------

type InterviewTurn = typeof schema.interviewTurn.$inferSelect;
type PatternCoverage = typeof schema.patternCoverage.$inferSelect;
type QuestionProposal = typeof schema.questionProposal.$inferSelect;

// ---------------------------------------------------------------------------
// ProgressStep
// ---------------------------------------------------------------------------

/**
 * サーバー側処理フェーズをユーザー向け 4 ステップにマッピングした列挙型。
 * 順序: upload → transcribe → analyze → prepare
 */
export const ProgressStep = z.enum(['upload', 'transcribe', 'analyze', 'prepare']);
export type ProgressStep = z.infer<typeof ProgressStep>;

// ---------------------------------------------------------------------------
// イベントスキーマ
// ---------------------------------------------------------------------------

/**
 * 処理ステップの進捗を通知するイベント。
 * 各ステップ開始直前にサーバーから送出される。
 */
export const ProgressEvent = z.object({
  type: z.literal('progress'),
  step: ProgressStep,
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

/**
 * 全処理ステップ完了を通知するイベント。
 * ターミナルイベント（ストリームはこのイベント送出後に close される）。
 *
 * `z.custom<T>()` により Drizzle 推論型を Zod スキーマに取り込む。
 * ランタイム検証はエンベロープの `type` フィールドのみ実施し、
 * ペイロード内容は Drizzle 推論型と DB スキーマ制約で担保する。
 */
export const CompleteEvent = z.object({
  type: z.literal('complete'),
  turn: z.custom<InterviewTurn>(),
  coverage: z.custom<PatternCoverage | null>(),
  transitionCoverage: z.custom<PatternCoverage | null>(),
  proposal: z.custom<QuestionProposal | null>(),
});
export type CompleteEvent = z.infer<typeof CompleteEvent>;

/**
 * 処理失敗を通知するイベント。
 * ターミナルイベント（ストリームはこのイベント送出後に close される）。
 */
export const ErrorEvent = z.object({
  type: z.literal('error'),
  code: z.enum(['core_phase_failed', 'unknown']),
  message: z.string().optional(),
  retryable: z.boolean().default(true),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

/**
 * SSE ストリームで送出される全イベントの discriminated union。
 * `type` フィールドにより型安全な分岐が可能。
 *
 * @example
 * const event = TurnsNextEvent.safeParse(parsed);
 * if (event.success && event.data.type === 'complete') {
 *   const turn: InterviewTurn = event.data.turn; // 型推論が InterviewTurn になる
 * }
 */
export const TurnsNextEvent = z.discriminatedUnion('type', [
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
]);
export type TurnsNextEvent = z.infer<typeof TurnsNextEvent>;

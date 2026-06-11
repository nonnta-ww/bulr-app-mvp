/**
 * live-state レスポンスの Zod スキーマと TypeScript 型定義。
 *
 * 設計方針（design.md: LiveStateAPI）:
 * - LiveState インターフェースをそのまま Zod スキーマに変換し、型安全なレスポンス構築を保証する
 * - LiveSegment / PatternCoverageSummary / ProposalView はネスト型として個別に export する
 * - このモジュールは pure（I/O なし）で、route.ts とクライアント（use-live-state.ts）が共有する
 *
 * coverage 分類ルール（design.md 3.1 / task 3.1 境界内の解釈）:
 *   - covered     : pattern_coverage テーブルに当該セッション × パターンの行が存在する
 *   - not_started : pattern_coverage 行が存在しない
 *   - in_progress : (将来拡張用に予約。現フェーズではターン単位のパターン帰属データが
 *                   まだ整備されていないため使用しない。TurnPipeline が成熟したフェーズで
 *                   「pattern_coverage 未存在かつ interview_turn.pattern_id に該当コードが
 *                   参照されている」場合に適用する)
 *
 * staleTranscript ルール（design.md 2.5 / Req 2.5）:
 *   - capture_status === 'recording' かつ
 *     (last_capture_event_at が null OR 20 秒超過) の場合に true
 *   - 'bot_joining' は除外（ボット参加中はまだトランスクリプトが来ない正常状態）
 *
 * Requirements: 2.1, 2.5, 3.1, 3.8, 7.1, 8.2
 * Design: LiveStateAPI (API Contract / LiveState interface)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// CaptureStatus 値リスト（capture-status.ts から型文字列を複製）
//
// import を避けて循環依存を防ぐため、値リストのみここで宣言する。
// 型の整合性は TypeScript コンパイラが import 元の CaptureStatus との互換チェックで保証する。
// ---------------------------------------------------------------------------

export const LIVE_STATE_CAPTURE_STATUS_VALUES = [
  'idle',
  'bot_joining',
  'recording',
  'stopping',
  'stopped',
  'failed',
  'aborted',
] as const;

// ---------------------------------------------------------------------------
// LiveSegment スキーマ
//
// transcript_segment の DB カラムを camelCase レスポンスに変換したもの。
// ---------------------------------------------------------------------------

export const LiveSegmentSchema = z.object({
  seq: z.number().int(),
  speakerRole: z.enum(['interviewer', 'candidate', 'unknown']),
  speakerLabel: z.string().nullable(),
  text: z.string(),
  startedAtMs: z.number().int(),
  endedAtMs: z.number().int(),
});

export type LiveSegment = z.infer<typeof LiveSegmentSchema>;

// ---------------------------------------------------------------------------
// PatternCoverageSummary スキーマ
//
// planned_pattern_codes の各エントリに対するカバレッジ状態。
// ---------------------------------------------------------------------------

export const CoverageStatusSchema = z.enum(['covered', 'in_progress', 'not_started']);
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;

export const PatternCoverageSummarySchema = z.object({
  /** 計画パターンコード（assessment_pattern.id と同一形式） */
  patternCode: z.string(),
  /** カバレッジ状態 */
  status: CoverageStatusSchema,
  /** 到達段階（0–4）。covered の場合のみ非 null */
  levelReached: z.number().int().nullable(),
});

export type PatternCoverageSummary = z.infer<typeof PatternCoverageSummarySchema>;

// ---------------------------------------------------------------------------
// ProposalView スキーマ
//
// question_proposal の最新行を UI 向けにマッピングしたもの。
// ---------------------------------------------------------------------------

export const ProposalCandidateSchema = z.object({
  text: z.string(),
  intent: z.string(),
});

export const ProposalViewSchema = z.object({
  /**
   * 3 件の質問候補。tuple として型付けし、必ず 3 件であることを保証する。
   */
  candidates: z.tuple([
    ProposalCandidateSchema,
    ProposalCandidateSchema,
    ProposalCandidateSchema,
  ]),
  /** 面接官が実際に使った候補のインデックス（0-based）。未使用なら null */
  selectedIndex: z.number().int().nullable(),
});

export type ProposalView = z.infer<typeof ProposalViewSchema>;

// ---------------------------------------------------------------------------
// LiveState スキーマ（design.md LiveStateAPI の interface 定義に対応）
// ---------------------------------------------------------------------------

export const LiveStateSchema = z.object({
  /** セッションの現在のキャプチャ状態 */
  captureStatus: z.enum(LIVE_STATE_CAPTURE_STATUS_VALUES),

  /**
   * トランスクリプトが停滞しているかどうか。
   * capture_status === 'recording' かつ last_capture_event_at が 20 秒超過 or null の場合 true。
   * UI に「転写が遅延しています」を表示するフラグ。
   */
  staleTranscript: z.boolean(),

  /**
   * セッションの自動解析上限に達しているかどうか（Req 4.5）。
   * analysis_capped_at != null の場合 true。
   */
  analysisCapped: z.boolean(),

  /**
   * cursor より大きい seq のトランスクリプトセグメント（昇順）。
   * cursor=0 の場合は全量（リロード復元、Req 8.2）。
   */
  segments: z.array(LiveSegmentSchema),

  /**
   * 計画パターンのカバレッジサマリ（Req 3.1）。
   * planned_pattern_codes 各エントリに 1 エントリ対応する。
   */
  coverage: z.array(PatternCoverageSummarySchema),

  /**
   * 最新の質問候補 3 件（Req 3.2）。
   * question_proposal が存在しない場合は null。
   */
  currentProposal: ProposalViewSchema.nullable(),

  /**
   * セッション開始からの経過秒数（Req 3.8）。
   * started_at が null の場合は 0。
   */
  elapsedSeconds: z.number(),

  /**
   * 未消化の計画パターン数（Req 3.8）。
   * covered でない planned_pattern_codes のカウント。
   */
  remainingPlannedPatterns: z.number().int(),

  /**
   * 次回ポーリング用カーソル。
   * 返却セグメントが 1 件以上ある場合は末尾の seq、なければ入力 cursor をそのまま返す。
   */
  nextCursor: z.number().int(),
});

export type LiveState = z.infer<typeof LiveStateSchema>;

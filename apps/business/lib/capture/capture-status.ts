/**
 * capture_status 遷移定義と検証ユーティリティ。
 *
 * 本モジュールは純粋関数のみを持つ（DB・I/O なし）。
 * CaptureOrchestrator（2.5）と webhook ルート（2.3）が消費する。
 *
 * 遷移グラフ（design.md: CaptureOrchestrator Responsibilities & Constraints）:
 *   idle       → bot_joining, recording
 *   bot_joining → recording, failed, aborted
 *   recording  → stopping, stopped, failed, aborted
 *   stopping   → stopped, aborted
 *   failed     → bot_joining, recording   （リカバリ可能。task 2.5）
 *   stopped    → （ターミナル）
 *   aborted    → （ターミナル。Req 7.6 — 中止後の受理拒否）
 */

export type CaptureStatus =
  | "idle"
  | "bot_joining"
  | "recording"
  | "stopping"
  | "stopped"
  | "failed"
  | "aborted";

/** 許可された遷移マップ（key → 遷移可能な to のリスト）。 */
export const ALLOWED_TRANSITIONS: Record<CaptureStatus, CaptureStatus[]> = {
  idle: ["bot_joining", "recording"],
  bot_joining: ["recording", "failed", "aborted"],
  recording: ["stopping", "stopped", "failed", "aborted"],
  stopping: ["stopped", "aborted"],
  // failed はリカバリ可能（再試行 or 対面切替。design.md task 2.5 参照）
  failed: ["bot_joining", "recording"],
  // ターミナル状態（遷移先なし）
  stopped: [],
  aborted: [],
};

/**
 * `from` から `to` への遷移が許可されているか判定する。
 *
 * @param from - 現在の capture_status
 * @param to   - 遷移先の capture_status
 * @returns    許可されていれば true
 */
export function canTransition(from: CaptureStatus, to: CaptureStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * `from` から `to` への遷移を検証し、不正な場合は Error を投げる。
 *
 * CaptureOrchestrator・webhook ルートが状態を書き込む前に呼び出すことで
 * 定義外遷移をデータ層に到達させないガードとして機能する。
 *
 * @throws {Error} 遷移が許可されていない場合
 */
export function assertTransition(
  from: CaptureStatus,
  to: CaptureStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `capture_status transition not allowed: ${from} → ${to}. ` +
        `Allowed from ${from}: [${ALLOWED_TRANSITIONS[from].join(", ") || "none (terminal state)"}]`,
    );
  }
}

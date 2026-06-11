import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  ALLOWED_TRANSITIONS,
  type CaptureStatus,
} from "./capture-status";

// ──────────────────────────────────────────────────────────────────────────────
// 許可された遷移（design.md: CaptureOrchestrator Responsibilities & Constraints）
// ──────────────────────────────────────────────────────────────────────────────
describe("canTransition - 許可された遷移", () => {
  const allowedCases: [CaptureStatus, CaptureStatus][] = [
    // idle → bot_joining (Recall 開始)
    ["idle", "bot_joining"],
    // idle → recording (マイクモード — bot 参加なし)
    ["idle", "recording"],
    // bot_joining → recording (bot 参加完了)
    ["bot_joining", "recording"],
    // bot_joining → failed (参加失敗)
    ["bot_joining", "failed"],
    // bot_joining → aborted (中止)
    ["bot_joining", "aborted"],
    // recording → stopping (面接終了指示)
    ["recording", "stopping"],
    // recording → stopped (call_ended 検知)
    ["recording", "stopped"],
    // recording → failed (bot.fatal)
    ["recording", "failed"],
    // recording → aborted (中止)
    ["recording", "aborted"],
    // stopping → stopped (ボット退出完了)
    ["stopping", "stopped"],
    // stopping → aborted (中止)
    ["stopping", "aborted"],
    // failed → bot_joining (再試行)
    ["failed", "bot_joining"],
    // failed → recording (対面/マイク切替)
    ["failed", "recording"],
  ];

  it.each(allowedCases)("%s → %s が許可される", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 拒否される遷移
// ──────────────────────────────────────────────────────────────────────────────
describe("canTransition - 拒否される遷移", () => {
  const rejectedCases: [CaptureStatus, CaptureStatus][] = [
    // idle → stopped (直接完了は不正)
    ["idle", "stopped"],
    // idle → aborted (中止は bot_joining / recording 以降)
    ["idle", "aborted"],
    // idle → failed (失敗は参加後)
    ["idle", "failed"],
    // recording → bot_joining (逆行)
    ["recording", "bot_joining"],
    // recording → idle (逆行)
    ["recording", "idle"],
    // stopped → recording (ターミナルから出発不可)
    ["stopped", "recording"],
    // stopped → idle (ターミナルから出発不可)
    ["stopped", "idle"],
    // stopped → bot_joining (ターミナルから出発不可)
    ["stopped", "bot_joining"],
    // stopped → stopping (ターミナルから出発不可)
    ["stopped", "stopping"],
    // stopped → failed (ターミナルから出発不可)
    ["stopped", "failed"],
    // stopped → aborted (ターミナルから出発不可)
    ["stopped", "aborted"],
  ];

  it.each(rejectedCases)("%s → %s が拒否される", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// aborted は常にターミナル（Req 7.6 — 中止の即時停止、以降のイベント受理拒否）
// ──────────────────────────────────────────────────────────────────────────────
describe("canTransition - aborted はターミナル", () => {
  const allStatuses: CaptureStatus[] = [
    "idle",
    "bot_joining",
    "recording",
    "stopping",
    "stopped",
    "failed",
    "aborted",
  ];

  it.each(allStatuses)("aborted → %s は拒否される", (to) => {
    expect(canTransition("aborted", to)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// stopped は常にターミナル
// ──────────────────────────────────────────────────────────────────────────────
describe("canTransition - stopped はターミナル", () => {
  const allStatuses: CaptureStatus[] = [
    "idle",
    "bot_joining",
    "recording",
    "stopping",
    "stopped",
    "failed",
    "aborted",
  ];

  it.each(allStatuses)("stopped → %s は拒否される", (to) => {
    expect(canTransition("stopped", to)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 自己遷移（同一ステータス → 同一ステータス）は拒否
// ──────────────────────────────────────────────────────────────────────────────
describe("canTransition - 自己遷移は拒否される", () => {
  const allStatuses: CaptureStatus[] = [
    "idle",
    "bot_joining",
    "recording",
    "stopping",
    "stopped",
    "failed",
    "aborted",
  ];

  it.each(allStatuses)("%s → %s（自己遷移）は拒否される", (status) => {
    expect(canTransition(status, status)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// assertTransition — 不正遷移で例外を投げ、正常遷移は void を返す
// ──────────────────────────────────────────────────────────────────────────────
describe("assertTransition", () => {
  it("許可された遷移では例外を投げない", () => {
    expect(() => assertTransition("idle", "bot_joining")).not.toThrow();
  });

  it("不正な遷移では Error を投げる", () => {
    expect(() => assertTransition("idle", "stopped")).toThrow();
  });

  it("aborted → recording は Error を投げる", () => {
    expect(() => assertTransition("aborted", "recording")).toThrow(
      /aborted/,
    );
  });

  it("stopped → idle は Error を投げる", () => {
    expect(() => assertTransition("stopped", "idle")).toThrow(/stopped/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ALLOWED_TRANSITIONS エクスポートの構造確認
// ──────────────────────────────────────────────────────────────────────────────
describe("ALLOWED_TRANSITIONS", () => {
  it("aborted のエントリが空配列（ターミナル）", () => {
    expect(ALLOWED_TRANSITIONS.aborted).toEqual([]);
  });

  it("stopped のエントリが空配列（ターミナル）", () => {
    expect(ALLOWED_TRANSITIONS.stopped).toEqual([]);
  });

  it("idle のエントリが bot_joining と recording を含む", () => {
    expect(ALLOWED_TRANSITIONS.idle).toContain("bot_joining");
    expect(ALLOWED_TRANSITIONS.idle).toContain("recording");
  });
});

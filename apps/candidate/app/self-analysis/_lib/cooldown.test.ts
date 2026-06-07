import { describe, it, expect } from "vitest";
import { canReAnswer } from "./cooldown";

describe("canReAnswer", () => {
  const BASE = new Date("2026-01-01T00:00:00Z");

  // 30日後の正確な日時（ミリ秒精度）
  const PLUS_30_DAYS = new Date(BASE.getTime() + 30 * 24 * 60 * 60 * 1000);
  const PLUS_29_DAYS = new Date(BASE.getTime() + 29 * 24 * 60 * 60 * 1000);
  const PLUS_31_DAYS = new Date(BASE.getTime() + 31 * 24 * 60 * 60 * 1000);

  // ケース 1: 初回（履歴なし — lastSubmittedAt === null）は常に許可 (Req 2.4)
  it("初回（lastSubmittedAt=null）は allowed=true、nextAvailableAt=null を返す", () => {
    const result = canReAnswer(null, BASE);
    expect(result.allowed).toBe(true);
    expect(result.nextAvailableAt).toBeNull();
  });

  // ケース 2: 29日経過（境界・拒否）— now < nextAvailableAt (Req 2.1, 2.2)
  it("29日経過（境界）は allowed=false かつ nextAvailableAt が lastSubmittedAt+30日", () => {
    const now = PLUS_29_DAYS;
    const result = canReAnswer(BASE, now);
    expect(result.allowed).toBe(false);
    expect(result.nextAvailableAt).toEqual(PLUS_30_DAYS);
  });

  // ケース 3: 30日ちょうど（境界・許可）— now === nextAvailableAt (Req 2.3)
  it("30日ちょうど経過（境界）は allowed=true、nextAvailableAt=null を返す", () => {
    const now = PLUS_30_DAYS;
    const result = canReAnswer(BASE, now);
    expect(result.allowed).toBe(true);
    expect(result.nextAvailableAt).toBeNull();
  });

  // ケース 4: 31日経過（allowed — 30日超過）(Req 2.3)
  it("31日経過は allowed=true、nextAvailableAt=null を返す", () => {
    const now = PLUS_31_DAYS;
    const result = canReAnswer(BASE, now);
    expect(result.allowed).toBe(true);
    expect(result.nextAvailableAt).toBeNull();
  });

  // ケース 5: カスタム cooldownDays（7日設定）— 6日経過は拒否
  it("cooldownDays=7 のとき 6日経過は allowed=false かつ nextAvailableAt が lastSubmittedAt+7日", () => {
    const lastSubmittedAt = new Date("2026-03-01T00:00:00Z");
    const plus6 = new Date(lastSubmittedAt.getTime() + 6 * 24 * 60 * 60 * 1000);
    const plus7 = new Date(lastSubmittedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = canReAnswer(lastSubmittedAt, plus6, 7);
    expect(result.allowed).toBe(false);
    expect(result.nextAvailableAt).toEqual(plus7);
  });

  // ケース 6: カスタム cooldownDays（7日設定）— 7日ちょうどは許可
  it("cooldownDays=7 のとき 7日ちょうどは allowed=true", () => {
    const lastSubmittedAt = new Date("2026-03-01T00:00:00Z");
    const plus7 = new Date(lastSubmittedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = canReAnswer(lastSubmittedAt, plus7, 7);
    expect(result.allowed).toBe(true);
    expect(result.nextAvailableAt).toBeNull();
  });
});

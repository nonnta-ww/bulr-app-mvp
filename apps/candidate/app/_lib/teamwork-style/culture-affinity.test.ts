/**
 * culture-affinity.test.ts — カルチャー親和性導出のユニットテスト（R6.1/R6.2/R6.3）。
 */

import { describe, expect, it } from "vitest";

import { deriveCultureAffinity } from "./culture-affinity";

describe("deriveCultureAffinity", () => {
  it("code 未確定（undefined）→ null（R6.3）", () => {
    expect(deriveCultureAffinity(undefined)).toBeNull();
  });

  it("直言×多様 → conflict=debate / 課題×ドライ → bonding=results", () => {
    const c = deriveCultureAffinity("direct-task-dry-diverge");
    expect(c?.conflict).toBe("debate");
    expect(c?.bonding).toBe("results");
    expect(c?.description.length).toBeGreaterThan(0);
  });

  it("調停×統一 → conflict=consensus / 関係×ウェット → bonding=family", () => {
    const c = deriveCultureAffinity("mediating-relational-wet-align");
    expect(c?.conflict).toBe("consensus");
    expect(c?.bonding).toBe("family");
  });

  it("混在（直言×統一 / 課題×ウェット）→ 両軸とも balanced", () => {
    const c = deriveCultureAffinity("direct-task-wet-align");
    expect(c?.conflict).toBe("balanced");
    expect(c?.bonding).toBe("balanced");
  });

  it("description に企業適合・合否の語や数字を含めない（R6.2/非評価）", () => {
    const codes = [
      "direct-task-dry-diverge",
      "mediating-relational-wet-align",
      "direct-task-wet-align",
      "mediating-task-dry-diverge",
    ] as const;
    for (const code of codes) {
      const c = deriveCultureAffinity(code);
      expect(c?.description).not.toMatch(/合否|不合格|適合度|御社|貴社/);
      expect(c?.description).not.toMatch(/[0-9]/);
    }
  });
});

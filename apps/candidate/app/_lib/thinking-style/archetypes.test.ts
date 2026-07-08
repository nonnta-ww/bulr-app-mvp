/**
 * archetypes.test.ts — 16アーキタイプ定義（キュレーテッド文言）の網羅・品質テスト。
 *
 * 16 code の網羅は `Record<ThinkingStyleCode, Archetype>` の型で強制済み（コンパイル時）。
 * 本テストはその補助として、AXIS_POLES の直積から全16 code を実行時に列挙し、
 *  (1) すべての code にエントリが存在すること、
 *  (2) 各フィールド（name/shortLabel/description/nextStep）が非空文字列であること、
 *  (3) name が16タイプで一意であること（R1.3 一意なアーキタイプ名）、
 *  (4) いずれのフィールドにも数字（半角/全角）を含まないこと（R2.4 数値・順位・他者比較の非表示）
 * を検証する。
 */

import { describe, expect, it } from "vitest";

import { AXIS_POLES, AXES } from "./axes";
import type { ThinkingStyleCode } from "./axes";
import { THINKING_STYLE_ARCHETYPES } from "./archetypes";

/** 半角/全角の数字を検出する正規表現（R2.4）。 */
const DIGIT_RE = /[0-9０-９]/;

/** AXIS_POLES の canonical order の直積から全16 code を列挙する。 */
function enumerateCodes(): ThinkingStyleCode[] {
  const [a1, a2, a3, a4] = AXES;
  if (!a1 || !a2 || !a3 || !a4) {
    throw new Error("AXES は4軸を持つ必要があります");
  }
  const codes: ThinkingStyleCode[] = [];
  for (const p1 of [AXIS_POLES[a1].low, AXIS_POLES[a1].high]) {
    for (const p2 of [AXIS_POLES[a2].low, AXIS_POLES[a2].high]) {
      for (const p3 of [AXIS_POLES[a3].low, AXIS_POLES[a3].high]) {
        for (const p4 of [AXIS_POLES[a4].low, AXIS_POLES[a4].high]) {
          codes.push(`${p1}-${p2}-${p3}-${p4}` as ThinkingStyleCode);
        }
      }
    }
  }
  return codes;
}

describe("THINKING_STYLE_ARCHETYPES", () => {
  const codes = enumerateCodes();

  it("列挙が4軸×2極＝16 code をちょうど生成する（重複なし）", () => {
    expect(codes).toHaveLength(16);
    expect(new Set(codes).size).toBe(16);
  });

  it("すべての16 code にアーキタイプ定義が存在する", () => {
    for (const code of codes) {
      expect(
        THINKING_STYLE_ARCHETYPES[code],
        `missing archetype for ${code}`,
      ).toBeDefined();
    }
  });

  it("定義済みキー数がちょうど16である（余剰キーなし）", () => {
    expect(Object.keys(THINKING_STYLE_ARCHETYPES)).toHaveLength(16);
  });

  it("各エントリの name/shortLabel/description/nextStep が非空文字列である", () => {
    for (const code of codes) {
      const a = THINKING_STYLE_ARCHETYPES[code];
      for (const field of [
        "name",
        "shortLabel",
        "description",
        "nextStep",
      ] as const) {
        expect(typeof a[field], `${code}.${field} type`).toBe("string");
        expect(
          a[field].trim().length,
          `${code}.${field} non-empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("name が16タイプで一意である（R1.3）", () => {
    const names = codes.map((code) => THINKING_STYLE_ARCHETYPES[code].name);
    expect(new Set(names).size, "archetype names must be unique").toBe(
      names.length,
    );
  });

  it("いずれのフィールドにも数字（半角/全角）を含まない（R2.4）", () => {
    for (const code of codes) {
      const a = THINKING_STYLE_ARCHETYPES[code];
      for (const field of [
        "name",
        "shortLabel",
        "description",
        "nextStep",
      ] as const) {
        expect(
          DIGIT_RE.test(a[field]),
          `${code}.${field} must not contain digits: "${a[field]}"`,
        ).toBe(false);
      }
    }
  });

  it("shortLabel は簡潔（クラス名埋め込み用の短い名詞）である", () => {
    for (const code of codes) {
      const { shortLabel } = THINKING_STYLE_ARCHETYPES[code];
      expect(
        shortLabel.length,
        `${code}.shortLabel length`,
      ).toBeGreaterThanOrEqual(2);
      expect(shortLabel.length, `${code}.shortLabel length`).toBeLessThanOrEqual(
        6,
      );
    }
  });
});

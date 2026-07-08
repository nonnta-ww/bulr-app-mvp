/**
 * archetypes.test.ts — 16アーキタイプ定義（キュレーテッド文言）の網羅・品質テスト。
 *
 * 16 code の網羅は `Record<TemperamentCode, Archetype>` の型で強制済み（コンパイル時）。
 * 本テストはその補助として、AXIS_POLES の直積から全16 code を実行時に列挙し、
 *  (1) すべての code にエントリが存在すること、
 *  (2) 各フィールド（name/shortLabel/description/nextStep）が非空文字列であること、
 *  (3) いずれのフィールドにも数字（半角/全角）を含まないこと（R2.3 数値・順位・他者比較の非表示）
 * を検証する。
 */

import { describe, expect, it } from "vitest";

import type { TemperamentCode } from "@bulr/types";

import { AXIS_POLES, AXES } from "./axes";
import { TEMPERAMENT_ARCHETYPES } from "./archetypes";

/** 半角/全角の数字を検出する正規表現（R2.3）。 */
const DIGIT_RE = /[0-9０-９]/;

/** AXIS_POLES の canonical order の直積から全16 code を列挙する。 */
function enumerateCodes(): TemperamentCode[] {
  const [a1, a2, a3, a4] = AXES;
  if (!a1 || !a2 || !a3 || !a4) {
    throw new Error("AXES は4軸を持つ必要があります");
  }
  const codes: TemperamentCode[] = [];
  for (const p1 of [AXIS_POLES[a1].low, AXIS_POLES[a1].high]) {
    for (const p2 of [AXIS_POLES[a2].low, AXIS_POLES[a2].high]) {
      for (const p3 of [AXIS_POLES[a3].low, AXIS_POLES[a3].high]) {
        for (const p4 of [AXIS_POLES[a4].low, AXIS_POLES[a4].high]) {
          codes.push(`${p1}-${p2}-${p3}-${p4}` as TemperamentCode);
        }
      }
    }
  }
  return codes;
}

describe("TEMPERAMENT_ARCHETYPES", () => {
  const codes = enumerateCodes();

  it("列挙が4軸×2極＝16 code をちょうど生成する（重複なし）", () => {
    expect(codes).toHaveLength(16);
    expect(new Set(codes).size).toBe(16);
  });

  it("すべての16 code にアーキタイプ定義が存在する", () => {
    for (const code of codes) {
      expect(TEMPERAMENT_ARCHETYPES[code], `missing archetype for ${code}`).toBeDefined();
    }
  });

  it("定義済みキー数がちょうど16である（余剰キーなし）", () => {
    expect(Object.keys(TEMPERAMENT_ARCHETYPES)).toHaveLength(16);
  });

  it("各エントリの name/shortLabel/description/nextStep が非空文字列である", () => {
    for (const code of codes) {
      const a = TEMPERAMENT_ARCHETYPES[code];
      for (const field of ["name", "shortLabel", "description", "nextStep"] as const) {
        expect(typeof a[field], `${code}.${field} type`).toBe("string");
        expect(a[field].trim().length, `${code}.${field} non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it("いずれのフィールドにも数字（半角/全角）を含まない（R2.3）", () => {
    for (const code of codes) {
      const a = TEMPERAMENT_ARCHETYPES[code];
      for (const field of ["name", "shortLabel", "description", "nextStep"] as const) {
        expect(DIGIT_RE.test(a[field]), `${code}.${field} must not contain digits: "${a[field]}"`).toBe(false);
      }
    }
  });

  it("shortLabel は簡潔（クラス名埋め込み用の短い名詞）である", () => {
    for (const code of codes) {
      const { shortLabel } = TEMPERAMENT_ARCHETYPES[code];
      expect(shortLabel.length, `${code}.shortLabel length`).toBeGreaterThanOrEqual(2);
      expect(shortLabel.length, `${code}.shortLabel length`).toBeLessThanOrEqual(5);
    }
  });
});

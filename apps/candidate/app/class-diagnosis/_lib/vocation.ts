/**
 * RPG クラス診断 — 職掌ベクトルの畳み込みと主/副判定（純関数, R1）。
 *
 * カテゴリ寄与スコア × カテゴリ→職掌アフィニティ重みを職掌ごとに加重平均し、
 * 7職掌の 0..100 ベクトルを得る。argmax を主職掌、相対75%（最大2）を副職掌とする。
 *
 * 決定論的：同一入力 → 同一出力。DB/LLM に一切依存しない純関数（テスト＝振る舞い）。
 * カテゴリ名はサーベイ横断で衝突するため、入力は `jobType` を必ず含む（resolver の複合キー用）。
 */

import type { Vocation } from "@bulr/types";

import {
  resolveCategoryVocationWeights,
  SUB_VOCATION_MAX,
  SUB_VOCATION_RATIO,
  VOCATIONS,
} from "./definitions";

/** 畳み込み入力（各カテゴリは jobType を必ず伴う）。 */
export interface VocationInput {
  categories: Array<{
    jobType: string;
    categoryName: string;
    categoryScore: number | null;
    answeredCount: number;
  }>;
}

/** 7職掌 0..100 ベクトル（全キー常在）。 */
export type VocationVector = Record<Vocation, number>;

/** 畳み込み結果。 */
export interface VocationResult {
  vector: VocationVector;
  /** argmax（決定論的 tiebreak: VOCATIONS displayOrder 先勝ち）。 */
  primary: Vocation;
  /** 相対75%・最大2・primary 除外。該当無しは空配列。 */
  subs: Vocation[];
  /** answeredCount の総和（全カテゴリ, null/0 含む）。 */
  totalAnswered: number;
}

/** 決定論的な丸め精度（小数2桁）。同点判定を安定させる。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 全職掌キーを 0 で初期化した Record を作る。 */
function zeroVector(): VocationVector {
  const v = {} as VocationVector;
  for (const voc of VOCATIONS) {
    v[voc] = 0;
  }
  return v;
}

/**
 * カテゴリ寄与を職掌ベクトルへ畳み込み、主/副職掌を決定論的に判定する（R1.1–1.7）。
 */
export function foldVocations(input: VocationInput): VocationResult {
  const numer = zeroVector();
  const denom = zeroVector();

  let totalAnswered = 0;
  for (const c of input.categories) {
    totalAnswered += c.answeredCount;

    if (c.categoryScore == null || c.answeredCount <= 0) {
      continue;
    }
    const weights = resolveCategoryVocationWeights(c.jobType, c.categoryName);
    for (const voc of VOCATIONS) {
      const w = weights[voc];
      if (w != null && w > 0) {
        numer[voc] += c.categoryScore * w;
        denom[voc] += w;
      }
    }
  }

  // per-vocation 加重平均 → 自然に 0..100。丸めて決定論性を担保。
  const vector = zeroVector();
  for (const voc of VOCATIONS) {
    vector[voc] = denom[voc] > 0 ? round2(numer[voc] / denom[voc]) : 0;
  }

  // primary = argmax（VOCATIONS 順で厳密最大 → 同点は先勝ち）。
  // VOCATIONS は7要素固定の非空リスト（definitions.ts）だが型は readonly[] なので明示。
  let primary: Vocation = VOCATIONS[0] ?? "vanguard";
  let primaryScore = vector[primary];
  for (const voc of VOCATIONS) {
    if (vector[voc] > primaryScore) {
      primary = voc;
      primaryScore = vector[voc];
    }
  }

  // subs: primary 以外で vector >= primary*0.75 かつ >0。vector 降順→displayOrder 昇順、最大 SUB_VOCATION_MAX。
  const threshold = primaryScore * SUB_VOCATION_RATIO;
  const subs: Vocation[] =
    primaryScore > 0
      ? VOCATIONS.filter(
          (voc) =>
            voc !== primary && vector[voc] > 0 && vector[voc] >= threshold,
        )
          .sort((a, b) => {
            if (vector[b] !== vector[a]) {
              return vector[b] - vector[a];
            }
            return VOCATIONS.indexOf(a) - VOCATIONS.indexOf(b);
          })
          .slice(0, SUB_VOCATION_MAX)
      : [];

  return { vector, primary, subs, totalAnswered };
}

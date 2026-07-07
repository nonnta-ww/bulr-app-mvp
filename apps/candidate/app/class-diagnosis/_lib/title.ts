/**
 * RPG クラス診断 — 広さ×深さの称号判定（純関数・決定論, R3.2–3.6）。
 *
 * 広さ(breadth) = ベクトルスコア >= BREADTH_ABS_THRESHOLD(60) の職掌数。
 * 深さ(depth)   = その対象職掌スコアの平均（対象0件なら0）。
 * (広 = breadth >= BREADTH_WIDE_MIN) × (深 = depth >= DEPTH_DEEP_MIN) の2×2で
 * 称号を決定する:
 *   広×深 → sage_hero（賢者/勇者） / 狭×深 → specialist（スペシャリスト）
 *   広×浅 → jack_of_all（遊撃/よろず屋） / 狭×浅 → apprentice（見習い）
 *
 * 決定論的：同一入力 → 同一出力。DB/LLM/乱数/時刻に一切依存しない純関数（テスト＝振る舞い）。
 * 職掌/称号の union 型は `@bulr/types` を唯一の正本として再利用する。
 */

import type { Title } from "@bulr/types";

import {
  BREADTH_ABS_THRESHOLD,
  BREADTH_WIDE_MIN,
  DEPTH_DEEP_MIN,
  VOCATIONS,
} from "./definitions";
import type { VocationResult } from "./vocation";

/** 称号判定結果。 */
export interface TitleResult {
  title: Title;
  /** 広さ: BREADTH_ABS_THRESHOLD 以上の職掌数（0..7）。 */
  breadth: number;
  /** 深さ: 対象職掌スコアの平均（0..100, 小数2桁丸め）。 */
  depth: number;
}

/** 決定論的な丸め精度（小数2桁）。境界判定を安定させる。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 職掌ベクトルから広さ×深さの称号を決定論的に判定する（R3.2–3.6）。
 */
export function resolveTitle(v: VocationResult): TitleResult {
  const qualified = VOCATIONS.filter(
    (voc) => v.vector[voc] >= BREADTH_ABS_THRESHOLD,
  );
  const breadth = qualified.length;
  const depth =
    breadth > 0
      ? round2(
          qualified.reduce((sum, voc) => sum + v.vector[voc], 0) / breadth,
        )
      : 0;

  const wide = breadth >= BREADTH_WIDE_MIN;
  const deep = depth >= DEPTH_DEEP_MIN;

  let title: Title;
  if (wide && deep) {
    title = "sage_hero";
  } else if (!wide && deep) {
    title = "specialist";
  } else if (wide && !deep) {
    title = "jack_of_all";
  } else {
    title = "apprentice";
  }

  return { title, breadth, depth };
}

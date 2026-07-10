/**
 * worklife-disposition/score.ts — 志向アンケート回答 → DispositionScores（純関数・決定論）。
 *
 * `DispositionKey` ごとに回答の `(level / maxLevel * 100)` の平均を取り、2桁丸め・0..100 クランプで
 * `DispositionScores` を算出する（spec: worklife-disposition-survey, R2.1–2.6）。
 *
 * 特性:
 *  - 純関数: 副作用・乱数・日付なし。同一入力 → 同一出力（R2.2）。
 *  - 回答が0件（未回答）のとき空オブジェクト `{}` を返す（R2.4/4.1）。
 *  - 回答の無い `DispositionKey` は結果オブジェクトにキー自体を含めない（R2.3）。
 *  - 各スコアは 0..100 にクランプする（R2.5）。
 *
 * `DispositionKey`/`DispositionScores` 型は `diagnosis-archetypes` の `dispositions.ts` から import し、
 * 再定義しない（R2.6, Out of Boundary）。
 *
 * Boundary: _lib/worklife-disposition/score.ts
 */

import type {
  DispositionKey,
  DispositionScores,
} from "../archetype/dispositions";
import type { WorklifeDispositionAnswer } from "./answers";

/** 決定論的な丸め精度（小数2桁）。境界判定を安定させる（temperament/vocation と同一方針）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 0..100 にクランプする。 */
function clamp0to100(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * 志向アンケート回答から DispositionScores を決定論的に算出する。
 *
 * `disposition` ごとに `Σ(level / maxLevel * 100) / count` を求め、2桁丸め・0..100 クランプする。
 * 回答が1件もない `DispositionKey` はキー自体を省略する。全体が空配列のときは `{}` を返す。
 */
export function scoreWorklifeDispositions(
  answers: WorklifeDispositionAnswer[],
): DispositionScores {
  // disposition ごとに (level/maxLevel*100) を集計する。
  const sums = {} as Record<DispositionKey, { total: number; count: number }>;

  for (const answer of answers) {
    // maxLevel が 0 以下（不正）なら寄与させない（0除算防止・防御的）。
    if (answer.maxLevel <= 0) {
      continue;
    }
    const pct = clamp0to100((answer.level / answer.maxLevel) * 100);
    const bucket = sums[answer.disposition] ?? { total: 0, count: 0 };
    bucket.total += pct;
    bucket.count += 1;
    sums[answer.disposition] = bucket;
  }

  const scores: DispositionScores = {};
  for (const key of Object.keys(sums) as DispositionKey[]) {
    const { total, count } = sums[key];
    if (count === 0) {
      continue;
    }
    scores[key] = clamp0to100(round2(total / count));
  }
  return scores;
}

/**
 * RPG クラス診断 — 気質2軸スコアと象限化（純関数, R2）。
 *
 * playstyle の設問回答を軸ごとに 0..100 正規化して平均し、中点(50)で二値化して
 * 4象限(気質)へ写像する。逆転設問は post-reverse 変換で吸収し、いずれかの軸が
 * ちょうど中点なら balanced=true とする。未回答（空配列）は null（R8.2）。
 *
 * 決定論的：同一入力 → 同一出力。DB/LLM に一切依存しない純関数（テスト＝振る舞い）。
 *
 * ## ポール向き契約（seed task 5 との取り決め — 重要）
 * post-reverse の正規化スコアが「高い」ほど 2番目に命名したポールを意味する。
 *   - explorationDeepening: score > 50 → deepener / score <= 50 → explorer（既定=explorer）
 *   - soloCollaboration:    score > 50 → collab   / score <= 50 → solo    （既定=solo）
 * よって playstyle seed（task 5）は、逆転フラグ込みで「高 level = より deepening / より
 * collaboration」となるよう設問と reverse を作らねばならない。
 */

import type { Temperament, TemperamentAxis } from "@bulr/types";

import { TEMPERAMENT_MIDPOINT } from "./definitions";

/** 気質設問1問の回答。reverse=true は (maxLevel - level) に変換して吸収する。 */
export interface TemperamentAnswer {
  axis: TemperamentAxis;
  level: number;
  reverse: boolean;
  maxLevel: number;
}

/** 気質判定結果（軸スコア・象限・中点フラグ）。 */
export interface TemperamentResult {
  axes: Record<TemperamentAxis, number>; // 0..100 per axis
  quadrant: Temperament; // explorer_solo | explorer_collab | deepener_solo | deepener_collab
  balanced: boolean; // いずれかの軸がちょうど中点なら true
}

/** 数値を2桁小数へ丸める（決定論的な安定化）。 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 気質2軸を採点し、4象限へ写像する。
 *
 * - 空配列 → null（未回答, R8.2/2.6）。
 * - 各回答: effective = reverse ? (maxLevel - level) : level、normalized = effective/maxLevel*100。
 * - 各軸: 属する回答の normalized 平均（2桁丸め）。回答が無い軸は中点(50)へフォールバック。
 * - 二値化: score > 50 で高ポール（deepener / collab）、<= 50 で既定ポール（explorer / solo）。
 * - balanced: いずれかの軸がちょうど中点(50)。
 */
export function scoreTemperament(
  answers: TemperamentAnswer[],
): TemperamentResult | null {
  if (answers.length === 0) {
    return null;
  }

  const sums: Record<TemperamentAxis, number> = {
    explorationDeepening: 0,
    soloCollaboration: 0,
  };
  const counts: Record<TemperamentAxis, number> = {
    explorationDeepening: 0,
    soloCollaboration: 0,
  };

  for (const answer of answers) {
    const effective = answer.reverse
      ? answer.maxLevel - answer.level
      : answer.level;
    const normalized =
      answer.maxLevel > 0 ? (effective / answer.maxLevel) * 100 : 0;
    sums[answer.axis] += normalized;
    counts[answer.axis] += 1;
  }

  const resolveAxis = (axis: TemperamentAxis): number =>
    counts[axis] > 0 ? round2(sums[axis] / counts[axis]) : TEMPERAMENT_MIDPOINT;

  const axes: Record<TemperamentAxis, number> = {
    explorationDeepening: resolveAxis("explorationDeepening"),
    soloCollaboration: resolveAxis("soloCollaboration"),
  };

  const explToken =
    axes.explorationDeepening > TEMPERAMENT_MIDPOINT ? "deepener" : "explorer";
  const soloToken =
    axes.soloCollaboration > TEMPERAMENT_MIDPOINT ? "collab" : "solo";
  const quadrant = `${explToken}_${soloToken}` as Temperament;

  const balanced =
    axes.explorationDeepening === TEMPERAMENT_MIDPOINT ||
    axes.soloCollaboration === TEMPERAMENT_MIDPOINT;

  return { axes, quadrant, balanced };
}

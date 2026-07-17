/**
 * score.ts — チームワーク・スタイルのスコアリング純関数（二者択一・partial 対応）。
 *
 * レイヤー1の二者択一回答を軸ごとに集計する。各回答は「第2極（高極）を選んだか」の
 * 二値（pickedHighPole）であり、高極ピックを100・低極ピックを0として軸内で平均し、
 * 中点(50)で二値化して極を決める。各軸は奇数問前提のため厳密な中点タイは通常発生しないが、
 * 防御的に「ちょうど中点 → 既定極（第1極）＋balanced=true」とする。
 *
 * 決定論的：同一入力 → 同一出力。DB/LLM/乱数/時刻に一切依存しない純関数（design.md「app core > score.ts」）。
 *
 * INVARIANT: `code` 非null ⇔ `completeness==='full'`。スコア数値は返り値に含むが UI へは露出しない
 * （数値非表示・R4.4/R9.2）。
 */

import {
  AXES,
  AXIS_POLES,
  TEAMWORK_MIDPOINT,
  type TeamworkAxis,
  type TeamworkCode,
  type TeamworkCompleteness,
  type TeamworkPole,
} from "./axes";

/** 1軸の判定結果（スコア・極・充足・拮抗）。 */
export interface AxisReading {
  /** 0..100（内部値・UI 非露出） */
  score: number;
  pole: TeamworkPole;
  /** その軸に回答が1問以上あったか */
  determined: boolean;
  /** score が中点ちょうどか */
  balanced: boolean;
}

/** ライブ算出のリッチ表現。`axes` は常に4軸キー完備。 */
export interface TeamworkProfile {
  axes: Record<TeamworkAxis, AxisReading>;
  completeness: TeamworkCompleteness;
  code: TeamworkCode | null;
}

/**
 * レイヤー1（二者択一）設問1問の回答。
 * pickedHighPole=true は第2極（高極）を、false は第1極（低極/既定極）を選んだことを表す。
 */
export interface TeamworkAnswer {
  axis: TeamworkAxis;
  pickedHighPole: boolean;
}

/** 数値を2桁小数へ丸める（決定論的な安定化）。 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 1問の正規化スコア（0..100）。高極ピック=100 / 低極ピック=0。 */
function normalize(answer: TeamworkAnswer): number {
  return answer.pickedHighPole ? 100 : 0;
}

/**
 * チームワーク回答を4軸で採点し、充足度・極・16型 code を持つ profile を決定論導出する。
 *
 * - 各軸: 属する回答の高極ピック率（0..100, 2桁丸め）。回答が無い軸は determined=false
 *   （score は中点で埋めるがキー完備のためのみで code/completeness には寄与させない）。
 * - 極: score > midpoint → 第2極（high）、<= midpoint → 第1極（既定極/low）。
 * - balanced: score が中点ちょうど。
 * - completeness: determined 軸数 0→none / 4→full / それ以外→partial。
 * - code: full のときのみ、determined 軸の極を canonical order で連結。それ以外は null。
 */
export function scoreTeamworkStyle(answers: TeamworkAnswer[]): TeamworkProfile {
  const sums = {} as Record<TeamworkAxis, number>;
  const counts = {} as Record<TeamworkAxis, number>;
  for (const axis of AXES) {
    sums[axis] = 0;
    counts[axis] = 0;
  }

  for (const answer of answers) {
    sums[answer.axis] += normalize(answer);
    counts[answer.axis] += 1;
  }

  const axes = {} as Record<TeamworkAxis, AxisReading>;
  const determinedPoles = {} as Record<TeamworkAxis, TeamworkPole>;
  let determinedCount = 0;

  for (const axis of AXES) {
    const determined = counts[axis] > 0;
    const score = determined
      ? round2(sums[axis] / counts[axis])
      : TEAMWORK_MIDPOINT;
    const pole =
      score > TEAMWORK_MIDPOINT ? AXIS_POLES[axis].high : AXIS_POLES[axis].low;
    const balanced = score === TEAMWORK_MIDPOINT;

    axes[axis] = { score, pole, determined, balanced };

    if (determined) {
      determinedCount += 1;
      determinedPoles[axis] = pole;
    }
  }

  const completeness: TeamworkCompleteness =
    determinedCount === 0
      ? "none"
      : determinedCount === AXES.length
        ? "full"
        : "partial";

  const code = completeness === "full" ? deriveCode(determinedPoles) : null;

  return { axes, completeness, code };
}

/**
 * canonical order（AXES 順）の極トークンを '-' 連結して16型 code を決定論導出する。
 * 入力キーの順序に依らず AXES 順で連結する。
 */
export function deriveCode(
  poles: Record<TeamworkAxis, TeamworkPole>,
): TeamworkCode {
  return AXES.map((axis) => poles[axis]).join("-") as TeamworkCode;
}

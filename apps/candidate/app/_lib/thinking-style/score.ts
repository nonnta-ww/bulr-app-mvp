/**
 * score.ts — 思考スタイルスコアリング純関数（4軸・partial 対応）。
 *
 * 思考スタイル設問の回答を軸ごとに 0..100 正規化して平均し、中点(50)で二値化して
 * 各軸の極を決定する。逆転設問は post-reverse 変換で吸収し、ちょうど中点なら既定極＋
 * balanced=true とする。回答の無い軸は `determined=false`（中点で「埋める」がキー完備のためのみで、
 * code/summary には寄与させない）。4軸すべて determined のときだけ16型 code を決定論導出する。
 *
 * 決定論的：同一入力 → 同一出力。DB/LLM/乱数/時刻に一切依存しない純関数（design.md「app core > score.ts」）。
 *
 * INVARIANT: `code` 非null ⇔ `completeness==='full'`。スコア数値は返り値に含むが UI へは露出しない。
 */

import {
  AXES,
  AXIS_POLES,
  THINKING_STYLE_MIDPOINT,
  type ThinkingStyleAxis,
  type ThinkingStyleCode,
  type ThinkingStyleCompleteness,
  type ThinkingStylePole,
  type ThinkingStyleSummary,
} from "./axes";

/** 1軸の判定結果（スコア・極・充足・拮抗）。 */
export interface AxisReading {
  /** 0..100（内部値・UI 非露出） */
  score: number;
  pole: ThinkingStylePole;
  /** その軸に回答が1問以上あったか */
  determined: boolean;
  /** score が中点ちょうどか */
  balanced: boolean;
}

/** ライブ算出のリッチ表現（standalone 用）。`axes` は常に4軸キー完備。 */
export interface ThinkingStyleProfile {
  axes: Record<ThinkingStyleAxis, AxisReading>;
  completeness: ThinkingStyleCompleteness;
  code: ThinkingStyleCode | null;
}

/** 思考スタイル設問1問の回答。reverse=true は (maxLevel - level) に変換して吸収する。 */
export interface ThinkingStyleAnswer {
  axis: ThinkingStyleAxis;
  level: number;
  reverse: boolean;
  maxLevel: number;
}

/** 数値を2桁小数へ丸める（決定論的な安定化）。 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 1問の post-reverse 正規化スコア（0..100）。 */
function normalize(answer: ThinkingStyleAnswer): number {
  const effective = answer.reverse
    ? answer.maxLevel - answer.level
    : answer.level;
  return answer.maxLevel > 0 ? (effective / answer.maxLevel) * 100 : 0;
}

/**
 * 思考スタイル回答を4軸で採点し、充足度・極・16型 code を持つ profile を決定論導出する。
 *
 * - 各軸: 属する回答の post-reverse 正規化平均（2桁丸め）。回答が無い軸は determined=false
 *   （score は中点で埋めるがキー完備のためのみ）。
 * - 極: score > midpoint → 第2極（high）、<= midpoint → 第1極（既定極/low）。
 * - balanced: score が中点ちょうど。
 * - completeness: determined 軸数 0→none / 4→full / それ以外→partial。
 * - code: full のときのみ、determined 軸の極を canonical order で連結。それ以外は null。
 */
export function scoreThinkingStyle(
  answers: ThinkingStyleAnswer[],
): ThinkingStyleProfile {
  const sums = {} as Record<ThinkingStyleAxis, number>;
  const counts = {} as Record<ThinkingStyleAxis, number>;
  for (const axis of AXES) {
    sums[axis] = 0;
    counts[axis] = 0;
  }

  for (const answer of answers) {
    sums[answer.axis] += normalize(answer);
    counts[answer.axis] += 1;
  }

  const axes = {} as Record<ThinkingStyleAxis, AxisReading>;
  const determinedPoles = {} as Record<ThinkingStyleAxis, ThinkingStylePole>;
  let determinedCount = 0;

  for (const axis of AXES) {
    const determined = counts[axis] > 0;
    const score = determined
      ? round2(sums[axis] / counts[axis])
      : THINKING_STYLE_MIDPOINT;
    const pole =
      score > THINKING_STYLE_MIDPOINT
        ? AXIS_POLES[axis].high
        : AXIS_POLES[axis].low;
    const balanced = score === THINKING_STYLE_MIDPOINT;

    axes[axis] = { score, pole, determined, balanced };

    if (determined) {
      determinedCount += 1;
      determinedPoles[axis] = pole;
    }
  }

  const completeness: ThinkingStyleCompleteness =
    determinedCount === 0
      ? "none"
      : determinedCount === AXES.length
        ? "full"
        : "partial";

  const code =
    completeness === "full" ? deriveCode(determinedPoles) : null;

  return { axes, completeness, code };
}

/**
 * canonical order（AXES 順）の極トークンを '-' 連結して16型 code を決定論導出する。
 * 入力キーの順序に依らず AXES 順で連結する。
 */
export function deriveCode(
  poles: Record<ThinkingStyleAxis, ThinkingStylePole>,
): ThinkingStyleCode {
  return AXES.map((axis) => poles[axis]).join("-") as ThinkingStyleCode;
}

/**
 * ThinkingStyleProfile を保存用のコンパクト射影 ThinkingStyleSummary へ変換する。
 * - poles: determined 軸のみ（未回答軸はキー自体を持たない）。
 * - balancedAxes: determined かつ balanced な軸。
 * - code / completeness: profile からそのまま射影。
 */
export function toSummary(
  profile: ThinkingStyleProfile,
): ThinkingStyleSummary {
  const poles: Partial<Record<ThinkingStyleAxis, ThinkingStylePole>> = {};
  const balancedAxes: ThinkingStyleAxis[] = [];

  for (const axis of AXES) {
    const reading = profile.axes[axis];
    if (!reading.determined) {
      continue;
    }
    poles[axis] = reading.pole;
    if (reading.balanced) {
      balancedAxes.push(axis);
    }
  }

  return {
    poles,
    balancedAxes,
    code: profile.code,
    completeness: profile.completeness,
  };
}

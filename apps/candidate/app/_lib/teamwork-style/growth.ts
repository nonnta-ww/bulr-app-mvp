/**
 * growth.ts — レイヤー2（成長ディメンション）の SJT 回答 → 非評価アドバイス写像（純関数・正本）。
 *
 * 自己認識 / 他者視点の取得 / 感情の自己制御 の3ディメンションを、状況判断（SJT）の
 * 選択肢に付与された発達段階 level（0..2）から集約する。内部段階（emerging/developing/strong）を
 * 決めるが、**画面には数値・段階ラベルを出さず、段階に対応する手書きの成長アドバイス文のみ**を
 * 提示する（R5.3/R5.4）。他者との比較・順位付けは行わない。
 *
 * 回答が1件以上あるディメンションのみを返す（R3.5・未回答ディメンションは除外）。
 * 決定論的：同一入力 → 同一出力。DB/LLM/乱数/時刻に非依存。
 *
 * content-canon.md「SJT ルーブリック」がアドバイス文の正本。
 */

/** 成長ディメンション（EQ/SQ 中核の3項）。 */
export type GrowthDimension =
  | "selfAwareness"
  | "perspectiveTaking"
  | "selfRegulation";

/** 内部段階（画面には出さない。アドバイス文の選択にのみ使う）。 */
export type GrowthStage = "emerging" | "developing" | "strong";

/** SJT 回答1件（選択肢の発達段階 level 0..2）。 */
export interface GrowthAnswer {
  dimension: GrowthDimension;
  /** SJT 選択肢の発達段階（0=低 .. 2=高）。 */
  level: number;
}

/** 1ディメンションの成長アドバイス（本人向け・伸びしろ文脈）。 */
export interface GrowthAdvice {
  dimension: GrowthDimension;
  /** ディメンションの表示名。 */
  label: string;
  /** 本人向けの成長アドバイス（数値・順位・他者比較を含まない）。 */
  advice: string;
}

/** 成長ディメンションの canonical order と表示名。 */
export const GROWTH_DIMENSIONS: readonly GrowthDimension[] = [
  "selfAwareness",
  "perspectiveTaking",
  "selfRegulation",
] as const;

export const GROWTH_LABELS: Record<GrowthDimension, string> = {
  selfAwareness: "自己認識",
  perspectiveTaking: "他者視点の取得",
  selfRegulation: "感情の自己制御",
};

/** SJT 選択肢 level の上限（0..2 の3段階）。seed（3.1）と一致させること。 */
export const GROWTH_MAX_LEVEL = 2;

/**
 * 段階 × ディメンション → 成長アドバイス文（content-canon.md「SJT ルーブリック」の正本）。
 * emerging/developing/strong いずれも非評価で、伸びしろ or 強みを本人視点で述べる。
 */
const GROWTH_ADVICE: Record<GrowthDimension, Record<GrowthStage, string>> = {
  selfAwareness: {
    emerging:
      "自分の感情や、それが周囲に与える影響は、意識しないと見えにくいものです。対立や違和感を覚えた瞬間に「今、自分は何を感じているか」を一度言葉にしてみると、反応の理由が掴めてきます。",
    developing:
      "自分の反応にはある程度気づけています。さらに「なぜそう感じたのか」まで一段掘り下げると、同じ場面での立ち回りに選択肢が増えます。",
    strong:
      "自分の感情と、それが他者にどう映るかを客観的に捉えられています。その自己認識を、まわりへのフォローや期待値のすり合わせに活かしていけます。",
  },
  perspectiveTaking: {
    emerging:
      "判断の起点が自分側に寄りやすい傾向があります。動く前に「相手はどんな事情や気持ちで、この状況にいるか」を一呼吸ぶん想像すると、伝わり方や関わり方が変わります。",
    developing:
      "相手の状況を汲もうとする姿勢があります。相手の意図や制約を先に確認してから動く癖をつけると、噛み合わなさが減っていきます。",
    strong:
      "相手の立場や感情を推し量って関われています。その読みの深さを、受け取りやすい伝え方や場の設計に活かしていけます。",
  },
  selfRegulation: {
    emerging:
      "対立やストレスの場面で、反応がそのまま表に出やすい傾向があります。カッとした瞬間に一拍おく・一度黙るだけでも、その後の展開が大きく変わります。",
    developing:
      "感情を抑えて対応することはできています。抑えるだけでなく、その状態を自分で自覚し、優先順位や対応可能な範囲を落ち着いて伝えられると、より建設的になります。",
    strong:
      "対立やプレッシャーの下でも、一拍おいて建設的に応じられています。その落ち着きは、緊張した場面でのチームの支えになります。",
  },
};

/** 平均 level（0..2）から内部段階を決める。<0.67→emerging / <1.34→developing / それ以上→strong。 */
function toStage(averageLevel: number): GrowthStage {
  if (averageLevel < 0.67) {
    return "emerging";
  }
  if (averageLevel < 1.34) {
    return "developing";
  }
  return "strong";
}

/**
 * SJT 回答束をディメンションごとに集約し、非評価の成長アドバイスへ写像する。
 *
 * - ディメンションごとに回答済み level を平均し、内部段階を決めてアドバイス文を選ぶ。
 * - 回答が1件以上あるディメンションのみ返す（未回答は除外）。
 * - 返却順は GROWTH_DIMENSIONS の canonical order。
 * - 出力に数値スコア・段階ラベル・他者比較は含めない。
 */
export function deriveGrowthAdvice(answers: GrowthAnswer[]): GrowthAdvice[] {
  const sums = {} as Record<GrowthDimension, number>;
  const counts = {} as Record<GrowthDimension, number>;
  for (const dimension of GROWTH_DIMENSIONS) {
    sums[dimension] = 0;
    counts[dimension] = 0;
  }

  for (const answer of answers) {
    if (counts[answer.dimension] === undefined) {
      continue;
    }
    sums[answer.dimension] += answer.level;
    counts[answer.dimension] += 1;
  }

  const result: GrowthAdvice[] = [];
  for (const dimension of GROWTH_DIMENSIONS) {
    if (counts[dimension] === 0) {
      continue;
    }
    const stage = toStage(sums[dimension] / counts[dimension]);
    result.push({
      dimension,
      label: GROWTH_LABELS[dimension],
      advice: GROWTH_ADVICE[dimension][stage],
    });
  }
  return result;
}

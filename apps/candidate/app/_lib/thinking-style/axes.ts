/**
 * axes.ts — 思考スタイル4軸・8極の定義とラベル（app-local コンテンツ）。
 *
 * 思考スタイル構造の union（`ThinkingStyleAxis`/`ThinkingStylePole`/`ThinkingStyleCode`）は
 * クロスパッケージ消費者を持たないため、共有 `@bulr/types` ではなく本 app-local ファイルに
 * 閉じて定義する（design.md「型を app ローカルに置く」逸脱判断）。気質（temperament）とは
 * 別個の軸キー・ラベルで定義し、直交した「どう考えるか」の構造を表す（R1.6）。
 *
 * canonical order は `ThinkingStyleCode` の template-literal 連結順
 *   `${AbstractPole}-${LogicPole}-${ConvergePole}-${TheoryPole}`
 * = 抽象具体軸 → 論理直感軸 → 収束発散軸 → 理論実践軸 と一致させる
 * （バー表示順・code 生成順の単一ソース）。
 */

/** 思考スタイル4軸の識別子（気質軸とは別個・R1.6）。 */
export type ThinkingStyleAxis =
  | "abstractConcrete"
  | "logicIntuition"
  | "convergentDivergent"
  | "theoryPractice";

/** 抽象具体軸の極（low=抽象 / high=具体）。 */
export type AbstractConcretePole = "abstract" | "concrete";
/** 論理直感軸の極（low=論理 / high=直感）。 */
export type LogicIntuitionPole = "logic" | "intuition";
/** 収束発散軸の極（low=収束 / high=発散）。 */
export type ConvergentDivergentPole = "convergent" | "divergent";
/** 理論実践軸の極（low=理論先行 / high=実践先行）。 */
export type TheoryPracticePole = "theory" | "practice";

/** 8極の union。各軸の第1極（low）／第2極（high）を横断する。 */
export type ThinkingStylePole =
  | AbstractConcretePole
  | LogicIntuitionPole
  | ConvergentDivergentPole
  | TheoryPracticePole;

/**
 * 16タイプの code。canonical order（抽象具体→論理直感→収束発散→理論実践）で
 * 各軸の極を '-' 連結した template-literal 型。2^4 = 16 通りを網羅する。
 */
export type ThinkingStyleCode =
  `${AbstractConcretePole}-${LogicIntuitionPole}-${ConvergentDivergentPole}-${TheoryPracticePole}`;

/** 診断の充足度。判定軸数 0 / 1–3 / 4 に対応。 */
export type ThinkingStyleCompleteness = "none" | "partial" | "full";

/**
 * 診断結果のサマリ（表示・共有用）。
 * - `poles`        = 判定済み軸のみの極マップ（未判定軸は欠落）
 * - `balancedAxes` = 中点拮抗で既定極を採用した軸の一覧
 * - `code`         = full 時のみ非null（4軸すべて判定済み）
 * - `completeness` = 充足度
 */
export type ThinkingStyleSummary = {
  poles: Partial<Record<ThinkingStyleAxis, ThinkingStylePole>>;
  balancedAxes: ThinkingStyleAxis[];
  code: ThinkingStyleCode | null;
  completeness: ThinkingStyleCompleteness;
};

/**
 * 思考スタイル4軸の canonical order。
 * `ThinkingStyleCode` の連結順（abstractConcrete → logicIntuition →
 * convergentDivergent → theoryPractice）と厳密に一致する。
 */
export const AXES: readonly ThinkingStyleAxis[] = [
  "abstractConcrete",
  "logicIntuition",
  "convergentDivergent",
  "theoryPractice",
] as const;

/**
 * 軸ラベル（日本語）。
 * - `first`  = 第1極（低・既定極）のラベル
 * - `second` = 第2極（高）のラベル
 * - `title`  = 「第1極 ⇔ 第2極」の見出し
 */
export const AXIS_LABELS: Record<
  ThinkingStyleAxis,
  { first: string; second: string; title: string }
> = {
  abstractConcrete: { first: "抽象", second: "具体", title: "抽象 ⇔ 具体" },
  logicIntuition: { first: "論理", second: "直感", title: "論理 ⇔ 直感" },
  convergentDivergent: {
    first: "収束",
    second: "発散",
    title: "収束 ⇔ 発散",
  },
  theoryPractice: {
    first: "理論先行",
    second: "実践先行",
    title: "理論先行 ⇔ 実践先行",
  },
};

/** 極ラベル（日本語）。8極それぞれの短い名詞。 */
export const POLE_LABELS: Record<ThinkingStylePole, string> = {
  abstract: "抽象",
  concrete: "具体",
  logic: "論理",
  intuition: "直感",
  convergent: "収束",
  divergent: "発散",
  theory: "理論先行",
  practice: "実践先行",
};

/**
 * 各軸の第1極（low・既定極）／第2極（high）の対応。
 * 「score > midpoint → high(第2極)」「score <= midpoint → low(第1極/既定極)」という向きを encode する。
 */
export const AXIS_POLES: Record<
  ThinkingStyleAxis,
  { low: ThinkingStylePole; high: ThinkingStylePole }
> = {
  abstractConcrete: { low: "abstract", high: "concrete" },
  logicIntuition: { low: "logic", high: "intuition" },
  convergentDivergent: { low: "convergent", high: "divergent" },
  theoryPractice: { low: "theory", high: "practice" },
};

/** 中点。score がこの値ちょうどのとき balanced（既定極＝第1極を採用）。 */
export const THINKING_STYLE_MIDPOINT = 50;

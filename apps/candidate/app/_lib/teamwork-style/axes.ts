/**
 * axes.ts — チームワーク・スタイル4軸・8極の定義とラベル（app-local コンテンツ・型の正本）。
 *
 * 対人・協働の型を表す4軸。すべて「良し悪しのない両極（value-neutral）」であり、
 * playstyle（気質: 探索/個人協調/計画即興/堅実挑戦）とは交差しない純・対人軸である
 * （design.md「Boundary Commitments」「レイヤー1」・R9.4）。
 *
 * 構造 union（TeamworkAxis / TeamworkPole / TeamworkCode）はここが正本。クロスパッケージ
 * 消費者を持たないため `@bulr/types` には置かず app-local に閉じる（design.md「型は app-local」）。
 *
 * canonical order は TeamworkCode の連結順
 *   `${CandorPole}-${FocusPole}-${DistancePole}-${DissentPole}`
 * = 率直さ → 判断の重心 → 距離感 → 異論への構え と一致させる（バー表示順・code 生成順の単一ソース）。
 *
 * level エンコード（seed 契約）: 二者択一 choice.level = 第1極:0 / 第2極:1。
 */

/** チームワーク・スタイル4軸。 */
export type TeamworkAxis = "candor" | "decisionFocus" | "distance" | "dissent";

/** 率直さ: 直言(第1極) ⇔ 調停(第2極)。 */
export type CandorPole = "direct" | "mediating";
/** 判断の重心: 課題(第1極) ⇔ 関係(第2極)。 */
export type FocusPole = "task" | "relational";
/** 距離感: ドライ(第1極) ⇔ ウェット(第2極)。 */
export type DistancePole = "dry" | "wet";
/** 異論への構え: 統一(第1極) ⇔ 多様(第2極)。 */
export type DissentPole = "align" | "diverge";

/** 8極の union。 */
export type TeamworkPole = CandorPole | FocusPole | DistancePole | DissentPole;

/**
 * 16タイプの安定コード。canonical order（率直さ→重心→距離→異論）の極を '-' 連結。
 * 例: 'direct-task-dry-align'（収束型ドライバー）。
 */
export type TeamworkCode =
  `${CandorPole}-${FocusPole}-${DistancePole}-${DissentPole}`;

/** 診断結果の充足度（レイヤー1・4軸ベース）。 */
export type TeamworkCompleteness = "none" | "partial" | "full";

/**
 * 4軸の canonical order。TeamworkCode の連結順と厳密に一致する。
 */
export const AXES: readonly TeamworkAxis[] = [
  "candor",
  "decisionFocus",
  "distance",
  "dissent",
] as const;

/**
 * 軸ラベル（日本語）。
 * - `first`  = 第1極（低・既定極, level 0）のラベル
 * - `second` = 第2極（高, level 1）のラベル
 * - `title`  = 「第1極 ⇔ 第2極」の見出し
 */
export const AXIS_LABELS: Record<
  TeamworkAxis,
  { first: string; second: string; title: string }
> = {
  candor: { first: "直言", second: "調停", title: "直言 ⇔ 調停" },
  decisionFocus: { first: "課題", second: "関係", title: "課題 ⇔ 関係" },
  distance: { first: "ドライ", second: "ウェット", title: "ドライ ⇔ ウェット" },
  dissent: { first: "統一", second: "多様", title: "統一 ⇔ 多様" },
};

/** 極ラベル（日本語）。8極それぞれの短い名詞。 */
export const POLE_LABELS: Record<TeamworkPole, string> = {
  direct: "直言",
  mediating: "調停",
  task: "課題",
  relational: "関係",
  dry: "ドライ",
  wet: "ウェット",
  align: "統一",
  diverge: "多様",
};

/**
 * 各軸の第1極（low・既定極・level 0）／第2極（high・level 1）の対応。
 * 「score > midpoint → high(第2極)」「score <= midpoint → low(第1極/既定極)」という向きを encode する。
 */
export const AXIS_POLES: Record<
  TeamworkAxis,
  { low: TeamworkPole; high: TeamworkPole }
> = {
  candor: { low: "direct", high: "mediating" },
  decisionFocus: { low: "task", high: "relational" },
  distance: { low: "dry", high: "wet" },
  dissent: { low: "align", high: "diverge" },
};

/** 中点。score がこの値ちょうどのとき balanced（既定極＝第1極を採用）。 */
export const TEAMWORK_MIDPOINT = 50;

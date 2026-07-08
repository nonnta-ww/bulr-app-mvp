/**
 * axes.ts — 気質4軸・8極の定義とラベル（app-local コンテンツ）。
 *
 * 気質構造の union（`TemperamentAxis`/`TemperamentPole`/`TemperamentCode`）は最下層
 * `@bulr/types` が正本。ここには表示ラベル・canonical order・極の対応・中点といった
 * app-local なコンテンツ/定義のみを置く（design.md「構造は types・コンテンツは app-local」）。
 *
 * canonical order は `TemperamentCode` の template-literal 連結順
 *   `${ExplorationPole}-${SocialPole}-${ProcessPole}-${RiskPole}`
 * = 探索軸 → 社会軸 → プロセス軸 → リスク軸 と一致させる（バー表示順・code 生成順の単一ソース）。
 */

import type {
  TemperamentAxis,
  TemperamentPole,
} from "@bulr/types";

/**
 * 気質4軸の canonical order。
 * `TemperamentCode` の連結順（exploration → social → process → risk）と厳密に一致する。
 */
export const AXES: readonly TemperamentAxis[] = [
  "explorationDeepening",
  "soloCollaboration",
  "planningImprovisation",
  "stabilityChallenge",
] as const;

/**
 * 軸ラベル（日本語）。
 * - `first`  = 第1極（低・既定極）のラベル
 * - `second` = 第2極（高）のラベル
 * - `title`  = 「第1極 ⇔ 第2極」の見出し
 */
export const AXIS_LABELS: Record<
  TemperamentAxis,
  { first: string; second: string; title: string }
> = {
  explorationDeepening: { first: "探索", second: "深化", title: "探索 ⇔ 深化" },
  soloCollaboration: { first: "個人", second: "協調", title: "個人 ⇔ 協調" },
  planningImprovisation: { first: "計画", second: "即興", title: "計画 ⇔ 即興" },
  stabilityChallenge: { first: "堅実", second: "挑戦", title: "堅実 ⇔ 挑戦" },
};

/** 極ラベル（日本語）。8極それぞれの短い名詞。 */
export const POLE_LABELS: Record<TemperamentPole, string> = {
  explorer: "探索",
  deepener: "深化",
  solo: "個人",
  collab: "協調",
  planner: "計画",
  improviser: "即興",
  stabilizer: "堅実",
  challenger: "挑戦",
};

/**
 * 各軸の第1極（low・既定極）／第2極（high）の対応。
 * 「score > midpoint → high(第2極)」「score <= midpoint → low(第1極/既定極)」という向きを encode する。
 */
export const AXIS_POLES: Record<
  TemperamentAxis,
  { low: TemperamentPole; high: TemperamentPole }
> = {
  explorationDeepening: { low: "explorer", high: "deepener" },
  soloCollaboration: { low: "solo", high: "collab" },
  planningImprovisation: { low: "planner", high: "improviser" },
  stabilityChallenge: { low: "stabilizer", high: "challenger" },
};

/** 中点。score がこの値ちょうどのとき balanced（既定極＝第1極を採用）。 */
export const TEMPERAMENT_MIDPOINT = 50;

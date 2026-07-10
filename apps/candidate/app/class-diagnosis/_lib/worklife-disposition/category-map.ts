/**
 * worklife-disposition/category-map.ts — seed カテゴリ名 → DispositionKey の対応表。
 *
 * `worklife-disposition-survey` の seed カテゴリ名（5件）を、`diagnosis-archetypes` が
 * 所有する `DispositionKey`（5志向）へ写像する（spec: worklife-disposition-survey, R2.1/2.6）。
 *
 * キーは seed 側のカテゴリ名と厳密一致する安定キー。seed のカテゴリ名は変更しない
 * （変更すると本対応表に無いカテゴリとして無視される）。
 *
 * `DispositionKey` は `../archetype/dispositions`（diagnosis-archetypes 所有）から import し、
 * 再定義しない（Out of Boundary）。
 */

import type { DispositionKey } from "../archetype/dispositions";

/** seed カテゴリ名 → DispositionKey（5件）。 */
export const WORKLIFE_DISPOSITION_CATEGORY_MAP: Record<string, DispositionKey> = {
  改善志向: "improvement",
  障害対応志向: "incident",
  育成志向: "mentoring",
  "調整・橋渡し志向": "coordination",
  新技術採用志向: "newTech",
};

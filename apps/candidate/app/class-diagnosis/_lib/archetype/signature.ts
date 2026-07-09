/**
 * archetype/signature.ts — アーキタイプ判定の重みテーブル（app-local config）。
 *
 * 各アーキタイプに「職掌重み × 気質極加点 × 志向加点」の signature を持たせ、
 * `resolveArchetype` が本人スコアとの内積で best-match を決める（spec: diagnosis-archetypes, R2/R3）。
 * 既存 `definitions.ts` の `CATEGORY_AFFINITY` と同型の「重みベクトル＋決定論的解決」パターン。
 *
 * 重みは初期設計値（実データ校正は後続）。全キー任意 — 欠損した職掌/極/志向は寄与0。
 * これにより survey 未整備の職掌（sage/strategist）や未提供の志向は自然に加点されず、
 * 該当アーキタイプ（Researcher / Strategist / Optimizer 等）は現時点で選ばれにくい（R3.1）。
 *
 * スケール:
 *  - vocation: 0..1（`vocationVector[v]` 0..100 に乗算）。
 *  - pole: 0..1（該当極が determined なら ×100 で加点）。
 *  - disposition: 0..1（`dispositions[k]` 0..100 に乗算）。
 */

import type { Vocation, TemperamentPole } from "@bulr/types";

import type { ArchetypeId } from "./definitions";
import type { DispositionKey } from "./dispositions";

/** 1アーキタイプの signature（重みベクトル）。全キー任意・欠損は寄与0。 */
export interface ArchetypeSignature {
  vocation?: Partial<Record<Vocation, number>>;
  pole?: Partial<Record<TemperamentPole, number>>;
  disposition?: Partial<Record<DispositionKey, number>>;
}

/** 12アーキタイプの signature（全 id 網羅, R1.2）。 */
export const ARCHETYPE_SIGNATURES: Record<ArchetypeId, ArchetypeSignature> = {
  builder: {
    vocation: { vanguard: 0.6, rearguard: 0.6, ranger: 0.5 },
    pole: { improviser: 0.4, challenger: 0.4 },
  },
  architect: {
    vocation: { rearguard: 0.5, guardian: 0.4, sage: 0.4 },
    pole: { planner: 0.4, deepener: 0.4 },
  },
  guardian: {
    vocation: { guardian: 0.9 },
    pole: { stabilizer: 0.4, deepener: 0.3 },
  },
  firefighter: {
    vocation: { guardian: 0.5, ranger: 0.5 },
    pole: { improviser: 0.4, challenger: 0.4 },
    disposition: { incident: 0.7 },
  },
  innovator: {
    vocation: { ranger: 0.4, sage: 0.3, vanguard: 0.3 },
    pole: { explorer: 0.7, challenger: 0.4 },
    disposition: { newTech: 0.7 },
  },
  optimizer: {
    vocation: { rearguard: 0.4, guardian: 0.4, vanguard: 0.3 },
    pole: { deepener: 0.4, stabilizer: 0.4 },
    disposition: { improvement: 0.7 },
  },
  researcher: {
    vocation: { sage: 0.9 },
    pole: { explorer: 0.3, deepener: 0.3, solo: 0.3 },
  },
  mentor: {
    vocation: { commander: 0.4, ranger: 0.2 },
    pole: { collab: 0.7, deepener: 0.3 },
    disposition: { mentoring: 0.7 },
  },
  commander: {
    vocation: { commander: 0.9 },
    pole: { planner: 0.3, collab: 0.3 },
  },
  strategist: {
    vocation: { strategist: 0.9 },
    pole: { planner: 0.4 },
  },
  integrator: {
    vocation: { ranger: 0.5, commander: 0.4 },
    pole: { collab: 0.7, improviser: 0.4 },
    disposition: { coordination: 0.7 },
  },
  craftsman: {
    vocation: { rearguard: 0.3, vanguard: 0.3, guardian: 0.3 },
    pole: { deepener: 0.7, stabilizer: 0.4, solo: 0.3 },
  },
};

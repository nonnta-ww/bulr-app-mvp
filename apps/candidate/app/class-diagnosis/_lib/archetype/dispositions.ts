/**
 * archetype/dispositions.ts — 志向信号の入力契約（前方互換）。
 *
 * 現行の気質4軸（探索⇔深化 / 個人⇔協調 / 計画⇔即興 / 堅実⇔挑戦）では直接測れない
 * 「働き方の志向」を表す任意入力。将来の `worklife-disposition-survey` が供給する契約で、
 * 未整備の現時点では未提供（＝寄与0）として扱う（spec: diagnosis-archetypes, R3.3）。
 *
 * この契約を通じて Optimizer / Firefighter / Mentor / Integrator / Innovator の判別を強化する。
 */

/** 志向の種類。worklife-disposition-survey が測る想定の5志向。 */
export type DispositionKey =
  | "improvement" // 改善志向（測って磨く）
  | "incident" // 障害対応志向（火消し）
  | "mentoring" // 育成志向
  | "coordination" // 調整・橋渡し志向
  | "newTech"; // 新技術採用志向

/**
 * 志向スコア（各 0..100）。全キー任意。未提供のキーは判定で寄与0。
 * survey 未整備の間は空（`{}`）が渡される。
 */
export type DispositionScores = Partial<Record<DispositionKey, number>>;

/**
 * archetype/resolve.ts — 主アーキタイプの決定論的導出（純関数）。
 *
 * 本人の `ClassResult`（職掌 vocationVector × 気質 temperament）＋任意の志向 `DispositionScores`
 * を signature と突き合わせ、素点最大の主アーキタイプ1つを best-match で決める
 * （spec: diagnosis-archetypes, R2/R3/R9）。
 *
 * 特性:
 *  - 決定論: 副作用・乱数・日付なし。同一入力→同一結果（R2.2）。
 *  - 常に非空: いかなる入力でも12種のいずれか1つを返す（R2.3）。全 score 0 でも `ARCHETYPE_ORDER`
 *    先頭へフォールバック。
 *  - 固定 tiebreak: 同点は `ARCHETYPE_ORDER` の先頭が勝つ（R2.4）。
 *  - 利用可能な信号のみ加点: 未提供の志向・未整備の職掌（値0）は寄与しない（R3.1）。
 *  - 既存フィールドのみから導出し、追加のデータ移行を要さない（R9.1/9.2）。性別属性は受け取らない（R8.3）。
 */

import type { ClassResult, TemperamentSummary, TemperamentAxis, TemperamentPole, Vocation } from "@bulr/types";

import { ARCHETYPE_ORDER, type ArchetypeId } from "./definitions";
import { ARCHETYPE_SIGNATURES } from "./signature";
import type { DispositionKey, DispositionScores } from "./dispositions";

/** determined な気質極の集合を取り出す（partial/null でも欠損なく扱う）。 */
function activePoles(temperament: TemperamentSummary | null): Set<TemperamentPole> {
  const poles = new Set<TemperamentPole>();
  if (!temperament) {
    return poles;
  }
  for (const axis of Object.keys(temperament.poles) as TemperamentAxis[]) {
    const pole = temperament.poles[axis];
    if (pole) {
      poles.add(pole);
    }
  }
  return poles;
}

/**
 * 各アーキタイプの素点（argmax 前）。テスト・可観測性用に公開する。
 * score = Σ(vocationVector·w) + Σ(determined pole ? w×100 : 0) + Σ(disposition·w)。
 */
export function scoreArchetype(
  result: ClassResult,
  dispositions: DispositionScores = {},
): Record<ArchetypeId, number> {
  const poles = activePoles(result.temperament);
  const scores = {} as Record<ArchetypeId, number>;

  for (const id of ARCHETYPE_ORDER) {
    const sig = ARCHETYPE_SIGNATURES[id];
    let score = 0;

    if (sig.vocation) {
      for (const v of Object.keys(sig.vocation) as Vocation[]) {
        score += (result.vocationVector[v] ?? 0) * (sig.vocation[v] ?? 0);
      }
    }
    if (sig.pole) {
      for (const p of Object.keys(sig.pole) as TemperamentPole[]) {
        if (poles.has(p)) {
          score += (sig.pole[p] ?? 0) * 100;
        }
      }
    }
    if (sig.disposition) {
      for (const k of Object.keys(sig.disposition) as DispositionKey[]) {
        score += (dispositions[k] ?? 0) * (sig.disposition[k] ?? 0);
      }
    }

    scores[id] = score;
  }

  return scores;
}

/**
 * 主アーキタイプを決定論的に導出する（常に非空・固定 tiebreak）。
 * `ARCHETYPE_ORDER` の順に走査し、厳密により大きい score のときだけ更新するため、
 * 同点時は先頭側が勝つ。
 */
export function resolveArchetype(
  result: ClassResult,
  dispositions: DispositionScores = {},
): ArchetypeId {
  const scores = scoreArchetype(result, dispositions);

  let best: ArchetypeId = ARCHETYPE_ORDER[0];
  for (const id of ARCHETYPE_ORDER) {
    if (scores[id] > scores[best]) {
      best = id;
    }
  }
  return best;
}

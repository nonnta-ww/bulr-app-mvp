/**
 * RPG クラス診断 — クラス組み立て（ClassResult, 純関数・決定論, R3.1/7.2/8.2/8.3/10/12.1）。
 *
 * 職掌(主/副/7ベクトル) × 気質(TemperamentSummary|null) × 称号 を確定判定結果 `ClassResult` へ組成する。
 * ここは判定の最終合流点であり、DB/LLM/乱数/時刻に一切依存しない純関数（テスト＝振る舞い）。
 *
 * 契約は `@bulr/types` の `ClassResult` を唯一の正本として再利用する（ここで再定義しない）。
 * 入力 VocationResult は vocation 判定、TitleResult は title 判定の出力。気質は app core
 * `_lib/temperament/score.ts` の `TemperamentProfile`（partial 対応）を受け、`completeness!=='none'`
 * のときだけ `toSummary` で `TemperamentSummary` へ射影して `ClassResult.temperament` に格納する。
 *
 * ## className 組成フォーマット（UI task 2.2 が依存する固定契約, R7.2）
 * 決定論的に日本語表示名を組み立てる。乱数・時刻・ロケール依存なし。
 *   - full（全4軸 determined, code 確定）: `${titleLabel}・${shortLabel}な${vocationLabel}`
 *       shortLabel は `TEMPERAMENT_ARCHETYPES[code].shortLabel`
 *       例: "スペシャリスト・設計者な前衛"
 *   - partial / none / 気質なし(null): `${titleLabel}・${vocationLabel}`（気質を省略）
 *       例: "スペシャリスト・前衛"
 * いずれも主職掌ラベルを必ず含み、非空。full で code が変われば className も変わる。
 */

import type { ClassResult, TemperamentSummary } from "@bulr/types";

import { TEMPERAMENT_ARCHETYPES } from "../../_lib/temperament/archetypes";
import type { TemperamentProfile } from "../../_lib/temperament/score";
import { toSummary } from "../../_lib/temperament/score";
import {
  TITLE_LABELS,
  VOCATION_LABELS,
  LOW_CONFIDENCE_MIN_ANSWERS,
} from "./definitions";
import type { TitleResult } from "./title";
import type { VocationResult } from "./vocation";

/**
 * 決定論的な日本語 className を組み立てる（R7.2）。
 * full（summary.completeness==='full' かつ code 非null）のときのみ archetype の shortLabel を
 * 埋め込む。partial/none/null は気質を省略する。主職掌ラベルは常に含み、非空を返す。
 */
function composeClassName(
  primaryVocationLabel: string,
  titleLabel: string,
  summary: TemperamentSummary | null,
): string {
  if (summary?.completeness === "full" && summary.code) {
    const shortLabel = TEMPERAMENT_ARCHETYPES[summary.code].shortLabel;
    return `${titleLabel}・${shortLabel}な${primaryVocationLabel}`;
  }
  return `${titleLabel}・${primaryVocationLabel}`;
}

/**
 * 職掌×気質×称号を ClassResult へ決定論的に組み立てる（R3.1/7.2/8.2/8.3/10/12.1）。
 *
 * - primaryVocation/subVocations/vocationVector は VocationResult をそのまま採用（7キー常在）。
 * - temperament: profile が無い / completeness==='none' なら null、それ以外は toSummary(profile)（R8.2）。
 * - representativeVocation = primary（最大比重 = 代表職掌, R10）。
 * - confidence = totalAnswered < LOW_CONFIDENCE_MIN_ANSWERS ? 'low' : 'normal'（R8.3）。
 * - className は composeClassName で決定論的に組成（full のみ気質埋め込み、非空, R7.2）。
 */
export function assembleClass(
  v: VocationResult,
  profile: TemperamentProfile | null,
  title: TitleResult,
): ClassResult {
  const summary: TemperamentSummary | null =
    profile && profile.completeness !== "none" ? toSummary(profile) : null;

  const className = composeClassName(
    VOCATION_LABELS[v.primary],
    TITLE_LABELS[title.title],
    summary,
  );

  return {
    primaryVocation: v.primary,
    subVocations: v.subs,
    vocationVector: v.vector,
    temperament: summary,
    title: title.title,
    representativeVocation: v.primary,
    className,
    confidence: v.totalAnswered < LOW_CONFIDENCE_MIN_ANSWERS ? "low" : "normal",
  };
}

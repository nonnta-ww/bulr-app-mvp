/**
 * RPG クラス診断 — クラス組み立て（ClassResult, 純関数・決定論, R3.1/8.2/8.3/10/12.1）。
 *
 * 職掌(主/副/7ベクトル) × 気質(single|null) × 称号 を確定判定結果 `ClassResult` へ組成する。
 * ここは判定の最終合流点であり、DB/LLM/乱数/時刻に一切依存しない純関数（テスト＝振る舞い）。
 *
 * 契約は `@bulr/types` の `ClassResult` を唯一の正本として再利用する（ここで再定義しない）。
 * 入力 VocationResult / TemperamentResult / TitleResult は各判定関数（vocation/temperament/title）の出力。
 *
 * ## className 組成フォーマット（UI task 8.2 が依存する固定契約）
 * 決定論的に日本語表示名を組み立てる。乱数・時刻・ロケール依存なし。
 *   - 気質あり: `${titleLabel}・${temperamentLabel}な${vocationLabel}`
 *       例: "スペシャリスト・孤高の深化者な前衛"
 *   - 気質なし(null, partial 診断 R8.2): `${titleLabel}・${vocationLabel}`
 *       例: "スペシャリスト・前衛"
 * いずれも主職掌ラベルを必ず含み、非空。気質が異なれば className も異なる
 * （同一 職掌/称号 でも temperamentLabel が変わるため）。
 */

import type { ClassResult } from "@bulr/types";

import {
  TEMPERAMENT_LABELS,
  TITLE_LABELS,
  VOCATION_LABELS,
  LOW_CONFIDENCE_MIN_ANSWERS,
} from "./definitions";
import type { TemperamentResult } from "./temperament";
import type { TitleResult } from "./title";
import type { VocationResult } from "./vocation";

/**
 * 決定論的な日本語 className を組み立てる。
 * 気質(null 可)を反映し、主職掌ラベルと称号ラベルを必ず含む非空文字列を返す。
 */
function composeClassName(
  primaryVocationLabel: string,
  titleLabel: string,
  temperamentLabel: string | null,
): string {
  // 気質あり: 称号・気質な職掌 / 気質なし(partial): 称号・職掌
  if (temperamentLabel !== null) {
    return `${titleLabel}・${temperamentLabel}な${primaryVocationLabel}`;
  }
  return `${titleLabel}・${primaryVocationLabel}`;
}

/**
 * 職掌×気質×称号を ClassResult へ決定論的に組み立てる（R3.1/8.2/8.3/10/12.1）。
 *
 * - primaryVocation/subVocations/vocationVector は VocationResult をそのまま採用（7キー常在）。
 * - temperament は t が無ければ null、temperamentBalanced は t?.balanced ?? false（R8.2）。
 * - representativeVocation = primary（最大比重 = 代表職掌, R10）。
 * - confidence = totalAnswered < LOW_CONFIDENCE_MIN_ANSWERS ? 'low' : 'normal'（R8.3）。
 * - className は composeClassName で決定論的に組成（気質で分岐、非空）。
 */
export function assembleClass(
  v: VocationResult,
  t: TemperamentResult | null,
  title: TitleResult,
): ClassResult {
  const temperament = t ? t.quadrant : null;
  const temperamentLabel = temperament ? TEMPERAMENT_LABELS[temperament] : null;

  const className = composeClassName(
    VOCATION_LABELS[v.primary],
    TITLE_LABELS[title.title],
    temperamentLabel,
  );

  return {
    primaryVocation: v.primary,
    subVocations: v.subs,
    vocationVector: v.vector,
    temperament,
    temperamentBalanced: t ? t.balanced : false,
    title: title.title,
    representativeVocation: v.primary,
    className,
    confidence: v.totalAnswered < LOW_CONFIDENCE_MIN_ANSWERS ? "low" : "normal",
  };
}

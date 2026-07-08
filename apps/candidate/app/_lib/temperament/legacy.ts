/**
 * legacy.ts — 旧2軸4型 ClassResult の read-time 互換正規化（app core・純関数）。
 *
 * 永続化済み旧 `ClassResult.temperament`（`'explorer_solo'|...` の legacy 文字列、または旧世代の
 * 保存欠損で `null`）を、新 `TemperamentSummary` へ read-time に非破壊で正規化する
 * （design.md「Components > legacy.ts」／「Data Models > 永続化」）。DB 行の書換えはしない。
 *
 * 入力は実際には jsonb から復元されるため、型注釈に反して任意の値が来うる。よって**総関数**とし、
 * 未知値でも throw せず `null` を返す（旧データ描画を保護＝R7.3）。旧値からは
 * explorationDeepening / soloCollaboration の2軸のみ determined な `completeness='partial'` を返し、
 * 残る2軸（planningImprovisation / stabilityChallenge）は未含とする（R7.4 の「残軸に回答」導線用）。
 *
 * 決定論的：同一入力 → 同一出力。DB/LLM/乱数/時刻に非依存。
 */

import type {
  ExplorationPole,
  LegacyTemperament,
  SocialPole,
  TemperamentSummary,
} from "@bulr/types";

/** 旧4型文字列 → 探索軸・社会軸の極マップ。ここに載る4値のみが legacy とみなされる。 */
const LEGACY_POLE_MAP: Record<
  string,
  { exploration: ExplorationPole; social: SocialPole }
> = {
  explorer_solo: { exploration: "explorer", social: "solo" },
  explorer_collab: { exploration: "explorer", social: "collab" },
  deepener_solo: { exploration: "deepener", social: "solo" },
  deepener_collab: { exploration: "deepener", social: "collab" },
};

/**
 * 値が既に新 `TemperamentSummary` 形状かを判定する型ガード（`completeness` と `poles` を持つ
 * オブジェクト）。jsonb 由来の任意入力に対し型安全に絞り込む（blanket any 不使用）。
 */
function isTemperamentSummary(value: unknown): value is TemperamentSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.completeness === "string" &&
    typeof candidate.poles === "object" &&
    candidate.poles !== null
  );
}

/**
 * 永続化済み ClassResult の気質値を `TemperamentSummary | null` に正規化する（総関数）。
 *
 * - `null` → `null`。
 * - 旧4型文字列 → explorationDeepening / soloCollaboration の2極のみ determined な partial summary
 *   （`balancedAxes=[]`, `code=null`, `completeness='partial'`）。
 * - 既に新 summary 形状 → そのまま返す（冪等）。
 * - それ以外（未知の文字列・不正なオブジェクト等）→ `null`（throw しない）。
 */
export function normalizeClassResultTemperament(
  raw: TemperamentSummary | LegacyTemperament | null,
): TemperamentSummary | null {
  if (raw === null) {
    return null;
  }

  if (typeof raw === "string") {
    // jsonb 由来の未知文字列も安全に落とすため、既知4値のマップ引きで判定する。
    const mapped = LEGACY_POLE_MAP[raw];
    if (!mapped) {
      return null;
    }
    return {
      poles: {
        explorationDeepening: mapped.exploration,
        soloCollaboration: mapped.social,
      },
      balancedAxes: [],
      code: null,
      completeness: "partial",
    };
  }

  if (isTemperamentSummary(raw)) {
    return raw;
  }

  return null;
}

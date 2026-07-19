/**
 * culture-affinity.ts — チームワーク・スタイル → カルチャー親和性の一方向導出（純関数・正本）。
 *
 * レイヤー1の4軸コードから「どんなカルチャーで活きるか」を **2つの独立したカルチャー軸**で
 * 位置づける（design.md「レイヤー3」・R6）。混在する場合は無理に振らず balanced とする。
 *
 *  - conflict（対立の扱い方）＝ 率直さ × 異論への構え:
 *      直言＋多様 → debate（議論歓迎） / 調停＋統一 → consensus（合意形成） / 混在 → balanced
 *  - bonding（結束の作り方）＝ 判断の重心 × 距離感:
 *      課題＋ドライ → results（成果主義） / 関係＋ウェット → family（家族的） / 混在 → balanced
 *
 * これは「この人はどんなカルチャーで活きるか」という **個人起点** の提示に限る。特定企業への適合・
 * 合否判定は行わない（R6.2）。レイヤー1が未確定（code=undefined）なら導出しない（null・R6.3）。
 *
 * 決定論的：同一入力 → 同一出力。content-canon.md「カルチャー親和性」が description の正本。
 */

import type {
  CandorPole,
  DissentPole,
  DistancePole,
  FocusPole,
  TeamworkCode,
} from "./axes";

/** 対立の扱い方の親和（率直さ×異論）。 */
export type ConflictCulture = "debate" | "consensus" | "balanced";
/** 結束の作り方の親和（判断の重心×距離感）。 */
export type BondingCulture = "results" | "family" | "balanced";

/** カルチャー親和性（個人起点・企業適合や合否を含まない）。 */
export interface CultureAffinity {
  conflict: ConflictCulture;
  bonding: BondingCulture;
  /** conflict×bonding の象限に対応する、個人起点のカルチャー像の説明。 */
  description: string;
}

/** conflict × bonding → 象限 description（content-canon.md の正本）。 */
const CULTURE_DESCRIPTIONS: Record<
  ConflictCulture,
  Record<BondingCulture, string>
> = {
  debate: {
    results:
      "率直に意見を交わし、成果を軸に動くフラットなカルチャーで活きるタイプです。議論の速さと結果志向がかみ合う環境で力を発揮します。",
    family:
      "率直さと人への情の厚さを併せ持つ、少数精鋭のカルチャーで活きるタイプです。本音で語り合える距離の近いチームが合います。",
    balanced:
      "率直に意見を交わせる環境で活きるタイプです。成果と人間関係のどちらにも寄りすぎない柔らかさがあります。",
  },
  consensus: {
    results:
      "着実に合意を積み上げつつ、成果でも実力を示すカルチャーで活きるタイプです。落ち着いた実力主義の場が合います。",
    family:
      "和を重んじ、人のつながりを大切にするカルチャーで活きるタイプです。じっくり信頼を育てる環境が合います。",
    balanced:
      "落ち着いた合意形成の場で活きるタイプです。成果と人間関係のバランスを取りながら物事を進めます。",
  },
  balanced: {
    results:
      "成果を軸にしつつ、率直さと調和を状況で使い分けられるカルチャーで活きるタイプです。柔軟に立ち回れます。",
    family:
      "人間関係を軸にしつつ、率直さと調和を状況で使い分けられるカルチャーで活きるタイプです。柔軟に立ち回れます。",
    balanced:
      "幅広いカルチャーに適応しやすいタイプです。対立の扱いも結束の作り方も、場に合わせて調整できます。",
  },
};

/** code を4極へ分解する（canonical order: 率直さ→重心→距離→異論）。 */
function splitCode(code: TeamworkCode): {
  candor: CandorPole;
  focus: FocusPole;
  distance: DistancePole;
  dissent: DissentPole;
} {
  const [candor, focus, distance, dissent] = code.split("-") as [
    CandorPole,
    FocusPole,
    DistancePole,
    DissentPole,
  ];
  return { candor, focus, distance, dissent };
}

/**
 * 4軸コードからカルチャー親和性を一方向に導出する。
 * code 未確定（undefined = レイヤー1が full 未満）なら null を返す（R6.3）。
 */
export function deriveCultureAffinity(
  code: TeamworkCode | undefined,
): CultureAffinity | null {
  if (!code) {
    return null;
  }

  const { candor, focus, distance, dissent } = splitCode(code);

  const conflict: ConflictCulture =
    candor === "direct" && dissent === "diverge"
      ? "debate"
      : candor === "mediating" && dissent === "align"
        ? "consensus"
        : "balanced";

  const bonding: BondingCulture =
    focus === "task" && distance === "dry"
      ? "results"
      : focus === "relational" && distance === "wet"
        ? "family"
        : "balanced";

  return {
    conflict,
    bonding,
    description: CULTURE_DESCRIPTIONS[conflict][bonding],
  };
}

/**
 * RPG クラス診断 — 定義マスタ（config）
 *
 * 職掌7 / 称号4 の型付き定数と、カテゴリ→職掌アフィニティ、
 * jobType→既定職掌、判定パラメータをここに集中定義する（判定ロジックの唯一の設定源, R9.1）。
 * 気質4軸・8極・16型の定義／ラベルは app core `_lib/temperament/`（axes.ts / archetypes.ts）へ移管済み。
 *
 * App-local（apps/candidate 配下）。`app → @bulr/types` の単方向依存は許容。
 * 職掌/称号の union 型は `@bulr/types` を唯一の正本として再利用し、ここでは再定義しない。
 *
 * ## カテゴリ名の衝突（重要）
 * カテゴリ名はサーベイ横断で一意ではない。「フレームワーク・ライブラリ」「アーキテクチャ設計」
 * 「パフォーマンス・チューニング」「テスト」は frontend / backend の双方に存在し、狙う職掌が
 * 異なる（前衛 vs 後衛）。そのため素の `Record<categoryName, weights>` では曖昧になる。
 * 解決は `jobType::categoryName` の複合キー + `JOBTYPE_DEFAULT_VOCATION[jobType]` フォールバックの
 * resolver（`resolveCategoryVocationWeights`）で行う。
 */

import type { Vocation, Title } from "@bulr/types";

/**
 * 7職掌の displayOrder（＝決定論的 tiebreak 順, R1.6）。
 * このリストの順序が同点時の優先順位を規定する。
 */
export const VOCATIONS: readonly Vocation[] = [
  "vanguard",
  "rearguard",
  "guardian",
  "sage",
  "commander",
  "strategist",
  "ranger",
] as const;

/** 4称号（広さ×深さ）。 */
export const TITLES: readonly Title[] = [
  "sage_hero",
  "specialist",
  "jack_of_all",
  "apprentice",
] as const;

/** 職掌の日本語ラベル（表示・className 組成用）。 */
export const VOCATION_LABELS: Record<Vocation, string> = {
  vanguard: "前衛",
  rearguard: "後衛",
  guardian: "守護",
  sage: "賢者",
  commander: "指揮",
  strategist: "策士",
  ranger: "遊撃",
};

/** 称号の日本語ラベル。 */
export const TITLE_LABELS: Record<Title, string> = {
  sage_hero: "賢者・勇者",
  specialist: "スペシャリスト",
  jack_of_all: "よろず屋・遊撃",
  apprentice: "見習い",
};

/**
 * jobType → 既定職掌。
 * seed 済み skill-survey の各職種を主軸となる職掌へマップする。
 * このマップに無い jobType（未知 / 未整備の survey）は寄与しない（resolver が空を返す）。
 * sage(賢者)・strategist(策士) は対応 survey 未整備のため本マップに含めない＝非活性枠。
 * 対応 survey を追加すれば、ここに1行足すだけで自動的に開放される（R9.2/9.3）。
 */
export const JOBTYPE_DEFAULT_VOCATION: Record<string, Vocation> = {
  frontend: "vanguard",
  backend: "rearguard",
  "infrastructure-sre": "guardian",
  "engineering-manager": "commander",
  "ai-driven-development": "ranger",
};

/**
 * カテゴリ→職掌アフィニティ（複合キー `${jobType}::${categoryName}`）。
 * 重みは 0..1、合計1でなくてよい。
 *
 * ここには「jobType 既定から逸脱／精緻化するカテゴリ（横断カテゴリ）」だけを列挙する。
 * 既定どおりで良いカテゴリは列挙不要 — resolver のフォールバックが
 * `{ [JOBTYPE_DEFAULT_VOCATION[jobType]]: 1 }` を返して網羅する。
 */
export const CATEGORY_AFFINITY: Record<
  string,
  Partial<Record<Vocation, number>>
> = {
  // backend の横断カテゴリ（インフラ／セキュリティ寄り）
  "backend::DevOps・インフラ": { rearguard: 0.5, guardian: 0.5 },
  "backend::セキュリティ（認証・認可以外）": { rearguard: 0.6, guardian: 0.4 },
  // frontend の横断カテゴリ（バックエンド／セキュリティ寄り）
  "frontend::バックエンド連携": { vanguard: 0.6, rearguard: 0.4 },
  "frontend::セキュリティ": { vanguard: 0.7, guardian: 0.3 },
  // infrastructure-sre のセキュリティ（既定と同じだが意図の明示）
  "infrastructure-sre::セキュリティ・コンプライアンス": { guardian: 1 },
};

/**
 * (jobType, categoryName) を職掌重みベクトルへ決定論的に解決する。
 *
 * - 明示的な `CATEGORY_AFFINITY[jobType::category]` があればそれを返す（横断カテゴリの精緻化）。
 * - 無ければ jobType が既知なら `{ [default vocation]: 1 }`（既定職掌へフォールバック）。
 * - jobType が未知なら `{}`（寄与しない）。
 *
 * これにより、現在および将来のあらゆるカテゴリが、明示的に精緻化されない限り
 * その jobType の既定職掌へ決定論的に解決されることを保証する。
 */
export function resolveCategoryVocationWeights(
  jobType: string,
  categoryName: string,
): Partial<Record<Vocation, number>> {
  const explicit = CATEGORY_AFFINITY[`${jobType}::${categoryName}`];
  if (explicit) {
    return explicit;
  }
  const defaultVocation = JOBTYPE_DEFAULT_VOCATION[jobType];
  if (defaultVocation) {
    return { [defaultVocation]: 1 };
  }
  return {};
}

// ── 判定パラメータ（校正可能、config 集中）─────────────────────────
export const SUB_VOCATION_RATIO = 0.75; // 副職掌 相対しきい値
export const SUB_VOCATION_MAX = 2; // 副職掌 上限
export const BREADTH_ABS_THRESHOLD = 60; // 「広さ」に数える職掌スコア絶対閾値(0..100)
export const BREADTH_WIDE_MIN = 4; // これ以上で「広」
export const DEPTH_DEEP_MIN = 70; // 深さ(対象職掌の平均熟練度)閾値
export const LOW_CONFIDENCE_MIN_ANSWERS = 8; // これ未満で低信頼(R8.3)

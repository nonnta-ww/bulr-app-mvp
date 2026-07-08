/**
 * 気質（プレイスタイル）契約型 — 4軸16型
 *
 * RPG クラス診断の気質構造の「正本」。ラベル等のコンテンツは app-local `definitions.ts` に置き、
 * 構造（軸・極 union・code）のみを最下層 `@bulr/types` に定義する（design.md「気質構造の union は
 * @bulr/types が正本、ラベル等は app-local」）。
 *
 * NOTE: packages/types は型のみ（Zod/ランタイム禁止）。app core の score.ts はこれらの型に
 * 一致するよう型付けされる。`TemperamentProfile`/`AxisReading`/`TemperamentAnswer` は
 * standalone のリッチ表現・入力であり app-local（score.ts）に置く。ここには ClassResult 保存用の
 * コンパクト射影 `TemperamentSummary` と、それを構成する構造型のみを定義する。
 */

/** 気質軸（どう戦うか）— 4軸。canonical order = code 生成順・バー表示順。 */
export type TemperamentAxis =
  | 'explorationDeepening' // 探索 ⇔ 深化
  | 'soloCollaboration' // 個人 ⇔ 協調
  | 'planningImprovisation' // 計画 ⇔ 即興
  | 'stabilityChallenge'; // 堅実 ⇔ 挑戦

/** 探索軸の極（既定極 → 第2極） */
export type ExplorationPole = 'explorer' | 'deepener';
/** 社会軸の極（既定極 → 第2極） */
export type SocialPole = 'solo' | 'collab';
/** プロセス軸の極（既定極 → 第2極） */
export type ProcessPole = 'planner' | 'improviser';
/** リスク軸の極（既定極 → 第2極） */
export type RiskPole = 'stabilizer' | 'challenger';

/** 極トークン（全軸の極の union） */
export type TemperamentPole =
  | ExplorationPole
  | SocialPole
  | ProcessPole
  | RiskPole;

/** 充足度 — determined 軸数 0→none / 4→full / それ以外→partial */
export type TemperamentCompleteness = 'none' | 'partial' | 'full';

/**
 * 16型 code — canonical order の極を '-' 連結した直積の template-literal 型。
 * 4軸×2極＝16通りを型レベルで列挙し、archetype キー欠落をコンパイルで検出する。
 */
export type TemperamentCode =
  `${ExplorationPole}-${SocialPole}-${ProcessPole}-${RiskPole}`;

/**
 * ClassResult 保存用のコンパクト射影（TemperamentProfile → これへ toSummary で射影）。
 * determined 軸の極のみを poles に保持し、拮抗軸を balancedAxes に列挙する。
 */
export interface TemperamentSummary {
  /** determined 軸のみ（未回答軸はキー自体を持たない） */
  poles: Partial<Record<TemperamentAxis, TemperamentPole>>;
  /** 中点ちょうど（既定極＋balanced）の軸 */
  balancedAxes: TemperamentAxis[];
  /** completeness==='full' のときのみ非null（アーキタイプ確定） */
  code: TemperamentCode | null;
  completeness: TemperamentCompleteness;
}

/**
 * 旧2軸4型の気質値。**legacy 正規化の入力型としてのみ温存**する（design.md legacy.ts）。
 * 新規レコードでは使用せず、永続化済み旧 ClassResult を TemperamentSummary へ正規化する
 * `normalizeClassResultTemperament` の入力としてのみ参照される。
 */
export type LegacyTemperament =
  | 'explorer_solo'
  | 'explorer_collab'
  | 'deepener_solo'
  | 'deepener_collab';

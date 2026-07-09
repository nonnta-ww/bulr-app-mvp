/**
 * archetype/definitions.ts — 12診断アーキタイプの master（app-local コンテンツ）。
 *
 * 診断結果の主役となる12のプロ・アーキタイプの識別子・名称・一行説明・ゲーム風異名を
 * 単一ソースとして定義する（spec: diagnosis-archetypes, R1/R5/R8）。
 *
 * 命名規約:
 *  - 性別中立・現実の開発職に通じる語彙（特定の性別を含意する語や、強く男性像/女性像に
 *    偏る武将系語を避ける, R8.1）。
 *  - 名称・一行説明・ゲーム風異名に数字・順位・他者比較を含めない（R8.4）。
 *  - 単一の命名セットを全ユーザーへ提示する（R8.2）。
 *
 * `ARCHETYPE_ORDER` は判定同点時の決定論的 tiebreak 順（R2.4）を兼ねる。
 * ゲーム風異名は "おまけ" 表示（class-catch-names から継承した和風RPG語彙・性別中立監査済, R5）。
 */

/** 12アーキタイプの識別子（表示順＝tiebreak 順）。 */
export type ArchetypeId =
  | "builder"
  | "architect"
  | "guardian"
  | "firefighter"
  | "innovator"
  | "optimizer"
  | "researcher"
  | "mentor"
  | "commander"
  | "strategist"
  | "integrator"
  | "craftsman";

/** 1アーキタイプの表示コンテンツ。 */
export interface Archetype {
  /** 識別子。 */
  id: ArchetypeId;
  /** 英語ハンドル（開発チームの普段使い, 例: 'Builder'）。 */
  handle: string;
  /** 日本語プロ名（主役見出し, 例: 'つくり手'）。 */
  name: string;
  /** 「どんな人か」を表す一行説明（数字・順位なし, R8.4）。 */
  tagline: string;
  /** おまけの「あえてゲームに例えるなら」の異名（性別中立, R5.3）。 */
  gameAlias: string;
}

/**
 * 12アーキタイプの決定論的 tiebreak 順（判定同点時に先頭が選ばれる, R2.4）。
 * `Record<ArchetypeId, ...>` と併せてキー網羅をコンパイル時に保証する。
 */
export const ARCHETYPE_ORDER = [
  "builder",
  "architect",
  "guardian",
  "firefighter",
  "innovator",
  "optimizer",
  "researcher",
  "mentor",
  "commander",
  "strategist",
  "integrator",
  "craftsman",
] as const satisfies readonly ArchetypeId[];

/** 12アーキタイプ master（全 id 網羅・非空, R1.1/R1.2）。 */
export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  builder: {
    id: "builder",
    handle: "Builder",
    name: "つくり手",
    tagline: "手を動かして動くものを次々と形にする",
    gameAlias: "鍛冶職人",
  },
  architect: {
    id: "architect",
    handle: "Architect",
    name: "設計者",
    tagline: "全体構造を描き、長く効く土台を作る",
    gameAlias: "城の設計主",
  },
  guardian: {
    id: "guardian",
    handle: "Guardian",
    name: "品質の番人",
    tagline: "壊れない・止まらないを守り抜く",
    gameAlias: "盾の守護者",
  },
  firefighter: {
    id: "firefighter",
    handle: "Firefighter",
    name: "火消し",
    tagline: "障害や炎上の最前線で即座に沈める",
    gameAlias: "救援の遊撃兵",
  },
  innovator: {
    id: "innovator",
    handle: "Innovator",
    name: "開拓者",
    tagline: "新しい技術や領域にいち早く飛び込む",
    gameAlias: "冒険者",
  },
  optimizer: {
    id: "optimizer",
    handle: "Optimizer",
    name: "改善屋",
    tagline: "既存を測って磨き、無駄を削る",
    gameAlias: "錬成師",
  },
  researcher: {
    id: "researcher",
    handle: "Researcher",
    name: "探究者",
    tagline: "深く調べ、データで本質を示す",
    gameAlias: "賢者",
  },
  mentor: {
    id: "mentor",
    handle: "Mentor",
    name: "育成役",
    tagline: "人を伸ばし、チームの力を底上げする",
    gameAlias: "指南役",
  },
  commander: {
    id: "commander",
    handle: "Commander",
    name: "まとめ役",
    tagline: "方針を定め、チームを動かし切る",
    gameAlias: "統率者",
  },
  strategist: {
    id: "strategist",
    handle: "Strategist",
    name: "戦略家",
    tagline: "何を作るべきかを見極め、盤面を設計する",
    gameAlias: "軍師",
  },
  integrator: {
    id: "integrator",
    handle: "Integrator",
    name: "調整役",
    tagline: "人と技術の間をつなぎ、全体を回す",
    gameAlias: "吟遊詩人",
  },
  craftsman: {
    id: "craftsman",
    handle: "Craftsman",
    name: "職人",
    tagline: "一点を極める深さとこだわりを持つ",
    gameAlias: "名匠",
  },
};

/**
 * archetypes.ts — 16タイプの気質アーキタイプ（キュレーテッド文言）。
 *
 * code（`${ExplorationPole}-${SocialPole}-${ProcessPole}-${RiskPole}`）ごとに、
 * 異名（`name`）・クラス名埋め込み用の簡潔なラベル（`shortLabel`）・働き方の説明（`description`）・
 * 次の一歩のヒント（`nextStep`）を定義する。
 *
 * 網羅保証: `Record<TemperamentCode, Archetype>` により16 code すべてのキーがコンパイル時に必須。
 * 品質規約（R2.1/R2.3）: 数字・順位・他者比較を文言に含めない。トーンは全16で統一する。
 */

import type { TemperamentCode } from "@bulr/types";

/** 1タイプのアーキタイプ表示コンテンツ。 */
export interface Archetype {
  /** 異名（短い名詞句）。standalone のフル提示に使う。 */
  name: string;
  /** クラス名に埋め込む簡潔な名詞（2〜5文字）。 */
  shortLabel: string;
  /** その気質の働き方を表す1〜2文の説明。 */
  description: string;
  /** 実行可能な成長のヒント（次の一歩）。 */
  nextStep: string;
}

/**
 * 16 code → アーキタイプ。
 * code は canonical order の極を '-' 連結（例: 'explorer-solo-planner-stabilizer'）。
 */
export const TEMPERAMENT_ARCHETYPES: Record<TemperamentCode, Archetype> = {
  // ── explorer × solo ──────────────────────────────────────────────
  "explorer-solo-planner-stabilizer": {
    name: "静かな地図職人",
    shortLabel: "地図職人",
    description:
      "新しい領域を独りで調べ、確かめた道筋を丁寧に地図へ落とし込む働き方です。手堅い足取りで未知を既知に変えていきます。",
    nextStep:
      "描いた地図を早めに誰かへ共有し、道が他の人にも通じるか確かめてみましょう。",
  },
  "explorer-solo-planner-challenger": {
    name: "孤高の開拓者",
    shortLabel: "開拓者",
    description:
      "誰も踏み込んでいない領域へ、計画を携えて独りで挑む働き方です。段取りを組みながらも大胆な一歩を辞さない姿勢を持ちます。",
    nextStep:
      "挑む前に撤退の目安を一つ決めておくと、思い切りがさらに活きてきます。",
  },
  "explorer-solo-improviser-stabilizer": {
    name: "身軽な放浪者",
    shortLabel: "放浪者",
    description:
      "興味の赴くまま独りで幅広く動き、その場の状況に合わせて手を変える働き方です。無理をせず着実に触れる範囲を広げます。",
    nextStep:
      "触れてきた発見を一つのメモにまとめ、後から辿れる形に残してみましょう。",
  },
  "explorer-solo-improviser-challenger": {
    name: "奔放な冒険者",
    shortLabel: "冒険者",
    description:
      "未知の領域へ独りで飛び込み、その場の勘で切り拓く働き方です。前例のない状況ほど生き生きと動きます。",
    nextStep:
      "動いた後に短い振り返りを挟むと、勢いが経験として積み上がっていきます。",
  },

  // ── explorer × collab ────────────────────────────────────────────
  "explorer-collab-planner-stabilizer": {
    name: "堅実な水先案内人",
    shortLabel: "案内人",
    description:
      "新しい領域を仲間とともに調べ、共有できる段取りへ整えていく働き方です。皆が安心して進める道筋づくりを大切にします。",
    nextStep:
      "案内する範囲を少し広げ、まだ地図のない領域へ仲間を誘ってみましょう。",
  },
  "explorer-collab-planner-challenger": {
    name: "旗を掲げる遠征隊長",
    shortLabel: "遠征隊長",
    description:
      "未踏の目標へ向けて仲間を束ね、計画を立てながら果敢に前進する働き方です。挑戦の旗印を掲げ、皆を巻き込んで進みます。",
    nextStep:
      "隊列の中の静かな声にも耳を傾けると、遠征がより強い足並みになります。",
  },
  "explorer-collab-improviser-stabilizer": {
    name: "気さくな触媒",
    shortLabel: "触媒",
    description:
      "人と人、話題と話題をその場でつなぎ、新しい組み合わせを軽やかに生む働き方です。無理なく場を活気づけます。",
    nextStep:
      "生まれたつながりのうち一つを、続く形に育ててみましょう。",
  },
  "explorer-collab-improviser-challenger": {
    name: "場を沸かす発起人",
    shortLabel: "発起人",
    description:
      "新しい試みを仲間へ持ちかけ、その場の勢いで挑戦へ火を点ける働き方です。動きながら人を巻き込むのが得意です。",
    nextStep:
      "点けた火を絶やさないよう、次に動く人へ役割を渡してみましょう。",
  },

  // ── deepener × solo ──────────────────────────────────────────────
  "deepener-solo-planner-stabilizer": {
    name: "沈黙の探究者",
    shortLabel: "探究者",
    description:
      "一つの領域を独りで深く掘り下げ、確かな手順を積み重ねる働き方です。静かな集中の中で本質へ迫ります。",
    nextStep:
      "掘り下げた知見を短い言葉にまとめ、他の人にも届く形にしてみましょう。",
  },
  "deepener-solo-planner-challenger": {
    name: "限界に挑む職人",
    shortLabel: "求道者",
    description:
      "極めたい領域を独りで計画的に磨きつつ、あえて難所へ挑む働き方です。高みを目指して自らに負荷をかけます。",
    nextStep:
      "挑戦の合間に休む区切りを設けると、探究の熱を長く保てます。",
  },
  "deepener-solo-improviser-stabilizer": {
    name: "手の内の名匠",
    shortLabel: "名匠",
    description:
      "得意な領域を独りで磨き、その場の勘所を押さえて着実に形にする働き方です。積んだ経験を柔軟に活かします。",
    nextStep:
      "培った勘所を言語化して残すと、匠の技が他の人にも伝わります。",
  },
  "deepener-solo-improviser-challenger": {
    name: "即興の名手",
    shortLabel: "名手",
    description:
      "深い理解を土台に、独りその場で難所へ即興で応じる働き方です。とっさの判断で局面を打開します。",
    nextStep:
      "即興で乗り越えた場面を後で言葉に残すと、次の一手がさらに冴えます。",
  },

  // ── deepener × collab ────────────────────────────────────────────
  "deepener-collab-planner-stabilizer": {
    name: "頼れる棟梁",
    shortLabel: "棟梁",
    description:
      "深い専門を土台に仲間と段取りを整え、堅実に物事を組み上げる働き方です。周りが安心して寄りかかれる柱になります。",
    nextStep:
      "抱えた知恵を後進へ手渡す機会をつくると、棟梁の芯がより太くなります。",
  },
  "deepener-collab-planner-challenger": {
    name: "高みを指す師範",
    shortLabel: "師範",
    description:
      "極めた専門を仲間と分かち合い、計画を立てて高い目標へ導く働き方です。周りの成長を促しながら難題に挑みます。",
    nextStep:
      "教える立場を少し緩め、仲間が自ら挑む余白を残してみましょう。",
  },
  "deepener-collab-improviser-stabilizer": {
    name: "頼もしい世話役",
    shortLabel: "世話役",
    description:
      "深い経験を活かして仲間を支え、その場の求めに柔らかく応じる働き方です。無理なく場を回し、皆の拠り所になります。",
    nextStep:
      "支える手を意識して休め、自分の探究にも時間を向けてみましょう。",
  },
  "deepener-collab-improviser-challenger": {
    name: "現場を導く先鋒",
    shortLabel: "先鋒",
    description:
      "深い理解を持って仲間の先頭に立ち、その場の難局へ即座に挑む働き方です。動きながら周りを引っ張ります。",
    nextStep:
      "先頭を走った後は歩みを緩め、仲間が追いつく間合いを取りましょう。",
  },
};

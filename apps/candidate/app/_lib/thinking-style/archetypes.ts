/**
 * archetypes.ts — 16タイプの思考スタイルアーキタイプ（キュレーテッド文言）。
 *
 * code（`${AbstractPole}-${LogicPole}-${ConvergePole}-${TheoryPole}`）ごとに、
 * 異名（`name`）・クラス名埋め込み用の簡潔なラベル（`shortLabel`）・考え方／学び方の説明
 * （`description`）・次の一歩のヒント（`nextStep`）を定義する。文言は Web エンジニアの
 * 「どう考え・どう学ぶか」をテーマに手書きでキュレーションした（LLM・外部生成不使用・R2.4）。
 *
 * 網羅保証: `Record<ThinkingStyleCode, Archetype>` により16 code すべてのキーがコンパイル時に必須。
 * 品質規約（R1.3/R2.4）: 名称は16タイプで一意。数字・順位・他者比較を文言に含めない。
 * トーンは全16で統一する。
 */

import type { ThinkingStyleCode } from "./axes";

/** 1タイプのアーキタイプ表示コンテンツ。 */
export interface Archetype {
  /** 異名（短い名詞句）。standalone のフル提示に使う。 */
  name: string;
  /** クラス名に埋め込む簡潔な名詞（2〜6文字）。 */
  shortLabel: string;
  /** その思考スタイルの考え方／学び方を表す1〜2文の説明。 */
  description: string;
  /** 実行可能な成長のヒント（次の一歩）。 */
  nextStep: string;
}

/**
 * 16 code → アーキタイプ。
 * code は canonical order（抽象具体→論理直感→収束発散→理論実践）の極を '-' 連結
 * （例: 'abstract-logic-convergent-theory'）。
 */
export const THINKING_STYLE_ARCHETYPES: Record<ThinkingStyleCode, Archetype> = {
  // ── abstract × logic ─────────────────────────────────────────────
  "abstract-logic-convergent-theory": {
    name: "静謐な理論家",
    shortLabel: "理論家",
    description:
      "物事を抽象度の高いモデルで捉え、筋道立てて一つの解へ収束させる考え方です。原理から入り、全体を貫く構造を見出すことを好みます。",
    nextStep:
      "組み上げた理屈を一度小さく動かし、現実がモデル通りに振る舞うか確かめてみましょう。",
  },
  "abstract-logic-convergent-practice": {
    name: "設計する実装者",
    shortLabel: "設計者",
    description:
      "頭の中で抽象的な設計を論理的に詰めつつ、まず手を動かして一つの答えへ寄せていく考え方です。理屈と実装を往復しながら形にします。",
    nextStep:
      "動かして得た手応えを設計図へ書き戻し、次に活きる形の知恵として残しましょう。",
  },
  "abstract-logic-divergent-theory": {
    name: "概念の探究者",
    shortLabel: "概念家",
    description:
      "抽象的な原理を論理で辿りながら、可能性を幾つもの方向へ広げて考える学び方です。一つの理論から派生する枝葉を楽しみます。",
    nextStep:
      "広げた着想のうち一つに絞り、小さな検証まで通して確かめてみましょう。",
  },
  "abstract-logic-divergent-practice": {
    name: "試作する構想家",
    shortLabel: "構想家",
    description:
      "抽象的な構想を論理で膨らませつつ、思いついた案を次々と試作で確かめる考え方です。手を動かしながら発想を広げます。",
    nextStep:
      "試した案を並べて比べ、どれを本命として深めるか一度立ち止まって選びましょう。",
  },

  // ── abstract × intuition ─────────────────────────────────────────
  "abstract-intuition-convergent-theory": {
    name: "本質を掴む洞察者",
    shortLabel: "洞察者",
    description:
      "抽象的な全体像を直感で一息に捉え、核心へ静かに収束させる考え方です。理屈より先に「これだ」という勘所へ辿り着きます。",
    nextStep:
      "掴んだ核心を言葉や図で辿れるように解きほぐし、他の人にも渡してみましょう。",
  },
  "abstract-intuition-convergent-practice": {
    name: "勘所を射る職人",
    shortLabel: "勘所職人",
    description:
      "全体像を直感で掴み、要点を一点に絞ってすぐ手を動かす考え方です。理屈を省いても要所を外さない鋭さを持ちます。",
    nextStep:
      "うまくいった一手の理由を後から言葉にすると、勘が再現できる技になります。",
  },
  "abstract-intuition-divergent-theory": {
    name: "閃きの夢想家",
    shortLabel: "夢想家",
    description:
      "抽象的な概念を直感で結びつけ、思考を自由な方向へ飛ばして広げる学び方です。既存の枠を越えた発想を得意とします。",
    nextStep:
      "飛んだ発想を一つ選び、地に足のついた形へ落とし込む筋道を描いてみましょう。",
  },
  "abstract-intuition-divergent-practice": {
    name: "遊びで拓く発明家",
    shortLabel: "発明家",
    description:
      "直感の赴くまま抽象的な着想を広げ、手を動かして次々と形にしていく考え方です。試すこと自体を発想の源にします。",
    nextStep:
      "生まれた試作の中から芯になる一つを見極め、じっくり育ててみましょう。",
  },

  // ── concrete × logic ─────────────────────────────────────────────
  "concrete-logic-convergent-theory": {
    name: "堅実な検証者",
    shortLabel: "検証者",
    description:
      "具体的な事実を論理で積み上げ、確かめながら一つの結論へ収束させる考え方です。根拠のある一歩を重ねて着実に進みます。",
    nextStep:
      "確かめた結論を支える前提を一段抽象化し、他の場面にも通じるか見渡してみましょう。",
  },
  "concrete-logic-convergent-practice": {
    name: "現場の解決者",
    shortLabel: "解決者",
    description:
      "目の前の具体的な課題を論理で分解し、手を動かして一つの解決へ導く考え方です。動くものを作りながら詰めていきます。",
    nextStep:
      "解いた手順を型としてまとめ、次の似た課題へすぐ使える形に残しましょう。",
  },
  "concrete-logic-divergent-theory": {
    name: "事例を編む分析家",
    shortLabel: "分析家",
    description:
      "具体的な事例を論理で読み解きながら、複数の解釈や仮説へ広げて考える学び方です。実例の中からパターンを掬い上げます。",
    nextStep:
      "広げた仮説の中から検証しやすい一つを選び、実データで確かめてみましょう。",
  },
  "concrete-logic-divergent-practice": {
    name: "手を動かす実験家",
    shortLabel: "実験家",
    description:
      "具体的な題材を論理で扱いつつ、いくつもの手を実際に試して確かめる考え方です。作って比べることで理解を広げます。",
    nextStep:
      "試した結果を一覧に整理し、次に深掘りする筋を一つ絞り込みましょう。",
  },

  // ── concrete × intuition ─────────────────────────────────────────
  "concrete-intuition-convergent-theory": {
    name: "経験に聴く匠",
    shortLabel: "熟達者",
    description:
      "具体的な経験を直感で束ね、要点を一つに絞って捉える考え方です。積んだ手触りから「こうなるはず」を静かに導きます。",
    nextStep:
      "感じ取った要点を言葉にして、なぜそう思うのかを一度たどってみましょう。",
  },
  "concrete-intuition-convergent-practice": {
    name: "即応の実務家",
    shortLabel: "実務家",
    description:
      "目の前の状況を直感で読み、要点へ絞って即座に手を動かす考え方です。考えるより先に体が動く現場の強さを持ちます。",
    nextStep:
      "とっさの判断を後で振り返り、効いた勘所を言葉に残しておきましょう。",
  },
  "concrete-intuition-divergent-theory": {
    name: "気配を辿る観察者",
    shortLabel: "観察者",
    description:
      "具体的な出来事を直感で捉え、そこから連想を幾筋にも広げて眺める学び方です。細部の気配から発想を汲み取ります。",
    nextStep:
      "広げた連想を一つ選び、確かめられる形の問いに落とし込んでみましょう。",
  },
  "concrete-intuition-divergent-practice": {
    name: "軽やかな試行者",
    shortLabel: "試行者",
    description:
      "具体的な素材を直感で扱い、思いつくままいくつも手を動かして試す考え方です。触れながら発想を広げるのが得意です。",
    nextStep:
      "試した中で手応えのあった一つに立ち返り、腰を据えて仕上げてみましょう。",
  },
};

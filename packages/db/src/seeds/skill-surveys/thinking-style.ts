/**
 * 思考スタイル診断 シードデータ
 *
 * spec: .kiro/specs/thinking-style-diagnosis（task 3.1・Req 5.1/5.3/5.4）
 *
 * 目的: Web アプリ開発人材の「思考スタイル」を 4 つの直交軸で測る 5 段階 Likert アンケート（全 24 問）。
 *  - 軸1「抽象と具体」→ abstractConcrete   （抽象 ⇔ 具体）
 *  - 軸2「論理と直感」→ logicIntuition     （論理 ⇔ 直感）
 *  - 軸3「収束と発散」→ convergentDivergent （収束 ⇔ 発散）
 *  - 軸4「理論と実践」→ theoryPractice      （理論先行 ⇔ 実践先行）
 *
 * スコアリング規約（score_kind='polarity'・survey_kind='thinking_style'）:
 *  - 各設問は single_choice・5 択・level 0..4 の Likert（maxLevel=4）。
 *  - **stored level が高いほど「第2極」寄り** を意味するよう統一する（R5.3）:
 *      軸1: level 4 = 具体寄り     / level 0 = 抽象寄り
 *      軸2: level 4 = 直感寄り     / level 0 = 論理寄り
 *      軸3: level 4 = 発散寄り     / level 0 = 収束寄り
 *      軸4: level 4 = 実践先行寄り / level 0 = 理論先行寄り
 *  - 測定バランスのため各軸 6 問を「自然表現(natural)」3問 ＋「反転表現(reverse)」3問で構成する:
 *      natural: 設問が第2極（具体/直感/発散/実践先行）を肯定 → 「強くそう思う」= level 4
 *      reverse: 設問が第1極（抽象/論理/収束/理論先行）を肯定 → 「強くそう思う」= level 0（level を反転）
 *    これにより設問文の向きに関わらず stored level は一様に「第2極寄りの量」を表す（逆転設問が向きを吸収する）。
 *
 * カテゴリ名は task 1.3 の `THINKING_STYLE_CATEGORY_AXIS`（カテゴリ名 → 軸）の安定キーのため変更しない。
 * subcategory は非 null 必須（'思考スタイル'）。
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';
import type { SkillSurveySeedData } from './runner';

/**
 * 自然表現(natural)の Likert 選択肢。
 * 「強くそう思う」= level 4（設問が第2極 = 具体/直感/発散/実践先行 を肯定するときに使用）。
 */
const NATURAL_LIKERT: Array<{ text: string; displayOrder: number; level: number }> = [
  { text: '全くそう思わない', displayOrder: 0, level: 0 },
  { text: 'あまりそう思わない', displayOrder: 1, level: 1 },
  { text: 'どちらとも言えない', displayOrder: 2, level: 2 },
  { text: 'ややそう思う', displayOrder: 3, level: 3 },
  { text: '強くそう思う', displayOrder: 4, level: 4 },
];

/**
 * 反転表現(reverse)の Likert 選択肢。
 * 「強くそう思う」= level 0（設問が第1極 = 抽象/論理/収束/理論先行 を肯定するときに使用）。
 * ラベル並びは自然文のままで、level のみ反転している。
 */
const REVERSE_LIKERT: Array<{ text: string; displayOrder: number; level: number }> = [
  { text: '全くそう思わない', displayOrder: 0, level: 4 },
  { text: 'あまりそう思わない', displayOrder: 1, level: 3 },
  { text: 'どちらとも言えない', displayOrder: 2, level: 2 },
  { text: 'ややそう思う', displayOrder: 3, level: 1 },
  { text: '強くそう思う', displayOrder: 4, level: 0 },
];

type Orientation = 'natural' | 'reverse';

/** 5 段階 Likert 設問を組み立てるヘルパ（single_choice / polarity 固定）。 */
function likertQuestion(
  text: string,
  displayOrder: number,
  orientation: Orientation,
): SkillSurveySeedData['categories'][number]['questions'][number] {
  return {
    text,
    questionType: 'single_choice',
    scoringKind: 'polarity',
    displayOrder,
    choices: orientation === 'natural' ? NATURAL_LIKERT : REVERSE_LIKERT,
  };
}

export const thinkingStyleSurveySeed: SkillSurveySeedData = {
  jobType: 'thinking_style',
  kind: 'thinking_style',
  title: '思考スタイル診断',
  categories: [
    // ══════════ 軸1: 抽象と具体 → abstractConcrete ══════════
    // level 4 = 具体寄り / level 0 = 抽象寄り。
    {
      name: '抽象と具体',
      // subcategory は非 null 必須（unique index (survey,name,subcategory) は
      // NULLS DISTINCT のため null だと onConflict が一致せず冪等性が壊れる）。
      subcategory: '思考スタイル',
      displayOrder: 0,
      questions: [
        // natural（具体を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          '新しい仕様を理解するとき、まず具体的なコード例や画面イメージから考え始める。',
          0,
          'natural',
        ),
        likertQuestion(
          '抽象的な議論より、動くサンプルや実データを見ながら考える方がしっくりくる。',
          1,
          'natural',
        ),
        likertQuestion(
          '設計を検討するときは、具体的なユースケースを一つずつ列挙して詰めていく方だ。',
          2,
          'natural',
        ),
        // reverse（抽象を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '個別の実装の細部より、システム全体を貫く概念やモデルを先に押さえたい。',
          3,
          'reverse',
        ),
        likertQuestion(
          '複数の似た問題に出会うと、それらを束ねる一般的な法則やパターンを見つけたくなる。',
          4,
          'reverse',
        ),
        likertQuestion(
          '目の前のコードより、アーキテクチャの構造や抽象的な設計原則を考えている時間が長い。',
          5,
          'reverse',
        ),
      ],
    },

    // ══════════ 軸2: 論理と直感 → logicIntuition ══════════
    // level 4 = 直感寄り / level 0 = 論理寄り。
    {
      name: '論理と直感',
      subcategory: '思考スタイル',
      displayOrder: 1,
      questions: [
        // natural（直感を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          '技術選定や設計の判断では、これまでの経験から来る「筋が良い感覚」を重視する。',
          0,
          'natural',
        ),
        likertQuestion(
          'バグの原因は、順を追って詰める前に「たぶんここだ」と直感で当たりをつけることが多い。',
          1,
          'natural',
        ),
        likertQuestion(
          '明確な根拠がなくても、しっくりくるかどうかで方針を決めることに抵抗はない。',
          2,
          'natural',
        ),
        // reverse（論理を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '結論を出す前に、前提から順序立てて筋道を検証しないと落ち着かない。',
          3,
          'reverse',
        ),
        likertQuestion(
          '判断の根拠を、データや明示的な理由として説明できる状態にしておきたい。',
          4,
          'reverse',
        ),
        likertQuestion(
          '「なんとなく良さそう」という感覚だけで進めるのは避け、論理的に裏づけを取る方だ。',
          5,
          'reverse',
        ),
      ],
    },

    // ══════════ 軸3: 収束と発散 → convergentDivergent ══════════
    // level 4 = 発散寄り / level 0 = 収束寄り。
    {
      name: '収束と発散',
      subcategory: '思考スタイル',
      displayOrder: 2,
      questions: [
        // natural（発散を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          '課題に取り組むとき、まずは筋の良し悪しを問わず選択肢を数多く出すことを楽しめる。',
          0,
          'natural',
        ),
        likertQuestion(
          '一つの実装に決める前に、まったく異なるアプローチも積極的に発想してみたい。',
          1,
          'natural',
        ),
        likertQuestion(
          '制約を一旦外して「そもそも他のやり方は?」と可能性を広げて考えるのが得意だ。',
          2,
          'natural',
        ),
        // reverse（収束を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '選択肢を広げるより、要点を絞って最適な一つに素早く収束させる方が得意だ。',
          3,
          'reverse',
        ),
        likertQuestion(
          'アイデアが増えてくると、早めに評価軸を決めて候補を絞り込みたくなる。',
          4,
          'reverse',
        ),
        likertQuestion(
          '発散した議論は落ち着かず、結論に向けて収束させることに価値を感じる。',
          5,
          'reverse',
        ),
      ],
    },

    // ══════════ 軸4: 理論と実践 → theoryPractice ══════════
    // level 4 = 実践先行寄り / level 0 = 理論先行寄り。
    {
      name: '理論と実践',
      subcategory: '思考スタイル',
      displayOrder: 3,
      questions: [
        // natural（実践先行を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          '新しい技術は、ドキュメントを読み込む前にまず動かして手を動かしながら覚える。',
          0,
          'natural',
        ),
        likertQuestion(
          '完璧に理解してから着手するより、試作して動かしながら学ぶ方が性に合っている。',
          1,
          'natural',
        ),
        likertQuestion(
          '仮説はまず小さく実装して試し、結果を見てから理屈を整理していく方だ。',
          2,
          'natural',
        ),
        // reverse（理論先行を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '実装に入る前に、仕組みや原理を十分に理解しておかないと不安が残る。',
          3,
          'reverse',
        ),
        likertQuestion(
          '手を動かす前に、背景にある理論や設計上の根拠を体系立てて押さえておきたい。',
          4,
          'reverse',
        ),
        likertQuestion(
          'とりあえず動かすより、なぜそう動くのかを理解してから進める方が納得できる。',
          5,
          'reverse',
        ),
      ],
    },
  ],
};

/**
 * thinking_style（思考スタイル）診断アンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runThinkingStyleSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, thinkingStyleSurveySeed, { logLabel: 'thinking-style' });
}

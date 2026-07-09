/**
 * プレイスタイル（気質）診断 シードデータ
 *
 * spec: .kiro/specs/rpg-class-diagnosis（task 5・気質レイヤー）
 *
 * 目的: Web アプリ開発人材の「気質」を 4 つの直交軸で測る 5 段階 Likert アンケート（全 24 問）。
 *  - 軸1「探索と深化」→ explorationDeepening（探索 ⇔ 深化）
 *  - 軸2「個人と協調」→ soloCollaboration（個人 ⇔ 協調）
 *  - 軸3「計画と即興」→ planningImprovisation（計画 ⇔ 即興）
 *  - 軸4「堅実と挑戦」→ stabilityChallenge（堅実 ⇔ 挑戦）
 *
 * スコアリング規約（score_kind='polarity'・survey_kind='playstyle'）:
 *  - 各設問は single_choice・5 択・level 0..4 の Likert。
 *  - **stored level が高いほど「第2極」寄り** を意味するよう統一する:
 *      軸1: level 4 = 深化寄り / level 0 = 探索寄り
 *      軸2: level 4 = 協調寄り / level 0 = 個人寄り
 *      軸3: level 4 = 即興寄り / level 0 = 計画寄り
 *      軸4: level 4 = 挑戦寄り / level 0 = 堅実寄り
 *  - task 3.2 `scoreTemperament` は axisScore = mean(level)/4*100 を計算し、
 *      explorationDeepening  > 50 → deepener  （<=50 explorer）
 *      soloCollaboration     > 50 → collab    （<=50 solo）
 *      planningImprovisation > 50 → improviser（<=50 planner）
 *      stabilityChallenge    > 50 → challenger（<=50 stabilizer）
 *    と判定する。したがって level の意味を全設問で「第2極寄りの強さ」に揃える必要がある。
 *  - 測定バランスのため各軸 6 問を「自然表現(natural)」3問 ＋「反転表現(reverse)」3問で構成する:
 *      natural: 設問が第2極（深化/協調/即興/挑戦）を肯定 → 「強くそう思う」= level 4
 *      reverse: 設問が第1極（探索/個人/計画/堅実）を肯定 → 「強くそう思う」= level 0（level を反転）
 *    これにより設問文の向きに関わらず stored level は一様に「第2極寄りの量」を表す。
 *
 * カテゴリ名は task 7 が「カテゴリ名 → 軸」の対応に使う安定キーのため変更しない。
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';
import type { SkillSurveySeedData } from './runner';

/**
 * 自然表現(natural)の Likert 選択肢。
 * 「強くそう思う」= level 4（設問が第2極 = 深化/協調 を肯定するときに使用）。
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
 * 「強くそう思う」= level 0（設問が第1極 = 探索/個人 を肯定するときに使用）。
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

/**
 * 5 段階 Likert 設問を組み立てるヘルパ（single_choice / polarity 固定）。
 * 全設問 `isRequired: true`（必須）。診断は全4軸の回答で確定タイプを返す前提のため、
 * 送信時に全問回答をサーバ検証で強制する。新規回答の充足度は full か none のみとなる。
 * partial は既存 class_diagnosis の旧2軸レコード（legacy 正規化）互換のために温存する。
 */
function likertQuestion(
  text: string,
  displayOrder: number,
  orientation: Orientation,
): SkillSurveySeedData['categories'][number]['questions'][number] {
  return {
    text,
    questionType: 'single_choice',
    scoringKind: 'polarity',
    isRequired: true,
    displayOrder,
    choices: orientation === 'natural' ? NATURAL_LIKERT : REVERSE_LIKERT,
  };
}

export const playstyleSurveySeed: SkillSurveySeedData = {
  jobType: 'playstyle',
  kind: 'playstyle',
  title: 'プレイスタイル（気質）診断',
  categories: [
    // ══════════ 軸1: 探索と深化 → explorationDeepening ══════════
    // level 4 = 深化寄り / level 0 = 探索寄り。
    {
      name: '探索と深化',
      // subcategory は非 null 必須（unique index (survey,name,subcategory) は
      // NULLS DISTINCT のため null だと onConflict が一致せず冪等性が壊れる）。
      subcategory: '気質',
      displayOrder: 0,
      questions: [
        // natural（深化を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          '一つの技術やテーマを、細部まで深く掘り下げて理解することに喜びを感じる。',
          0,
          'natural',
        ),
        likertQuestion(
          '興味を持った領域は、時間をかけてでも本質を極めるまで取り組みたい。',
          1,
          'natural',
        ),
        likertQuestion(
          '広く浅くより、特定分野の専門性を磨くことに価値を感じる。',
          2,
          'natural',
        ),
        // reverse（探索を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '新しい技術やツールが登場すると、まず幅広く試してみたくなる。',
          3,
          'reverse',
        ),
        likertQuestion(
          '一つのことを続けるより、次々と新しい分野に手を広げる方が好きだ。',
          4,
          'reverse',
        ),
        likertQuestion(
          '未知の領域を探索しているときが、最も刺激的で楽しい。',
          5,
          'reverse',
        ),
      ],
    },

    // ══════════ 軸2: 個人と協調 → soloCollaboration ══════════
    // level 4 = 協調寄り / level 0 = 個人寄り。
    {
      name: '個人と協調',
      subcategory: '気質',
      displayOrder: 1,
      questions: [
        // natural（協調を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          'チームで議論しながら進める方が、良いアウトプットを出せると感じる。',
          0,
          'natural',
        ),
        likertQuestion(
          '自分の考えを共有し、メンバーと協働することにやりがいを感じる。',
          1,
          'natural',
        ),
        likertQuestion(
          '課題に直面したとき、周囲と相談しながら解決策を探るのが好きだ。',
          2,
          'natural',
        ),
        // reverse（個人を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '一人で集中して作業を最後までやり遂げる方が性に合っている。',
          3,
          'reverse',
        ),
        likertQuestion(
          '意思決定は自分の判断で完結できる方が、進めやすいと感じる。',
          4,
          'reverse',
        ),
        likertQuestion(
          '他者と歩調を合わせるより、自分のペースで取り組みたい。',
          5,
          'reverse',
        ),
      ],
    },

    // ══════════ 軸3: 計画と即興 → planningImprovisation ══════════
    // level 4 = 即興寄り / level 0 = 計画寄り。
    {
      name: '計画と即興',
      subcategory: '気質',
      displayOrder: 2,
      questions: [
        // natural（即興を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          '状況の変化に合わせて、その場で柔軟に方針を変えていくのが得意だ。',
          0,
          'natural',
        ),
        likertQuestion(
          '細かく計画を立てるより、走りながら調整していく方が性に合っている。',
          1,
          'natural',
        ),
        likertQuestion(
          '予定外の展開が起きても、臨機応変に対応することを楽しめる。',
          2,
          'natural',
        ),
        // reverse（計画を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '取りかかる前に、手順やスケジュールをきちんと組み立てておきたい。',
          3,
          'reverse',
        ),
        likertQuestion(
          '見通しを立ててから進める方が、安心して取り組める。',
          4,
          'reverse',
        ),
        likertQuestion(
          '行き当たりばったりより、計画通りに物事が進むことを好む。',
          5,
          'reverse',
        ),
      ],
    },

    // ══════════ 軸4: 堅実と挑戦 → stabilityChallenge ══════════
    // level 4 = 挑戦寄り / level 0 = 堅実寄り。
    {
      name: '堅実と挑戦',
      subcategory: '気質',
      displayOrder: 3,
      questions: [
        // natural（挑戦を肯定 → 強くそう思う = level 4）×3
        likertQuestion(
          'リスクがあっても、新しいやり方に挑戦することにワクワクする。',
          0,
          'natural',
        ),
        likertQuestion(
          '前例のない領域に飛び込んで、可能性を切り拓くことにやりがいを感じる。',
          1,
          'natural',
        ),
        likertQuestion(
          '大きな成果のためなら、多少の失敗リスクは進んで引き受けたい。',
          2,
          'natural',
        ),
        // reverse（堅実を肯定 → 強くそう思う = level 0）×3
        likertQuestion(
          '実績のある確実な方法を選び、着実に成果を積み上げたい。',
          3,
          'reverse',
        ),
        likertQuestion(
          '不確実な賭けより、リスクを抑えた堅実な選択を優先する。',
          4,
          'reverse',
        ),
        likertQuestion(
          '大きく攻めるより、失敗を避けて安定を保つことを大切にする。',
          5,
          'reverse',
        ),
      ],
    },
  ],
};

/**
 * playstyle（気質）診断アンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runPlaystyleSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, playstyleSurveySeed, { logLabel: 'playstyle' });
}

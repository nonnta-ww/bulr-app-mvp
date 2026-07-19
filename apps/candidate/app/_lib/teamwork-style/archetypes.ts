/**
 * archetypes.ts — 16タイプのチームワーク・スタイルアーキタイプ（キュレーテッド文言・正本）。
 *
 * code（`${CandorPole}-${FocusPole}-${DistancePole}-${DissentPole}`）ごとに、
 * 正式名（`name`＝機能ラベル: 役割×修飾）・キャッチ（`catch`＝キャラ名）・
 * 対人協働スタイルの説明（`description`）・成長の一歩（`nextStep`）を定義する。
 * 命名規約と文言は content-canon.md「16タイプ命名」の正本（手書き・LLM/外部生成不使用）。
 *
 * 網羅保証: `Record<TeamworkCode, Archetype>` により16 code すべてのキーがコンパイル時に必須。
 * 品質規約（R4.3/R4.5）: 名称・キャッチは16タイプで一意。数字・順位・他者比較・優劣を文言に含めない。
 * 全16で価値中立のトーンを統一する。
 */

import type { TeamworkCode } from "./axes";

/** 1タイプのアーキタイプ表示コンテンツ。 */
export interface Archetype {
  /** 正式名（機能ラベル: 修飾＋役割。例: 収束型ドライバー）。 */
  name: string;
  /** キャッチ（キャラ名。結果・共有で併記。例: 一刀両断の推進者）。 */
  catch: string;
  /** その対人・協働スタイルを表す1〜2文の説明（価値中立）。 */
  description: string;
  /** 実行可能な成長のヒント（次の一歩）。 */
  nextStep: string;
}

/**
 * 16 code → アーキタイプ。
 * code は canonical order（率直さ→重心→距離→異論）の極を '-' 連結（例: 'direct-task-dry-align'）。
 */
export const TEAMWORK_ARCHETYPES: Record<TeamworkCode, Archetype> = {
  // ── direct × task（ドライバー） ───────────────────────────────────
  "direct-task-dry-align": {
    name: "収束型ドライバー",
    catch: "一刀両断の推進者",
    description:
      "率直に意見を述べ、冷静に成果へと一直線に物事をまとめていくスタイルです。感情に流されず、決めるべきを決めて前へ進めます。",
    nextStep:
      "結論を急ぐ前に、周囲がその判断に納得できているかを一度確かめると、推進力がさらに効いてきます。",
  },
  "direct-task-dry-diverge": {
    name: "探索型ドライバー",
    catch: "歯に衣着せぬ論客",
    description:
      "成果のために率直に異を唱え、論点を開いて選択肢を広げていくスタイルです。割れることを恐れず、より良い答えを探します。",
    nextStep:
      "広げた論点のどれを本命にするか、意識して絞り込む場面を作ると、議論が成果に結びつきます。",
  },
  "direct-task-wet-align": {
    name: "求心型ドライバー",
    catch: "熱血の旗振り役",
    description:
      "熱量をもって率直に人を巻き込み、一つの目標へと束ねていくスタイルです。目指す先を掲げ、チームを同じ方向へ引っ張ります。",
    nextStep:
      "熱が強いぶん、まだ温まっていない人の歩調にも目を向けると、より多くの人がついてきます。",
  },
  "direct-task-wet-diverge": {
    name: "共感型ドライバー",
    catch: "情熱の開拓者",
    description:
      "情熱的に議論を交わしながらも、多様な声を拾って成果へつなげるスタイルです。人の温度を保ちつつ前を切り拓きます。",
    nextStep:
      "広げた熱と声を、どこかで一本の道筋に束ねる区切りを設けると、開拓が形になります。",
  },

  // ── direct × relational（カタリスト） ─────────────────────────────
  "direct-relational-dry-align": {
    name: "収束型カタリスト",
    catch: "本音の調整者",
    description:
      "率直に本音を引き出しつつ、冷静に場の足並みを整えていくスタイルです。言いにくいことも扱いながら、まとまりを作ります。",
    nextStep:
      "整える力に加え、あえて意見が割れたままにする余地も残すと、対話が深まります。",
  },
  "direct-relational-dry-diverge": {
    name: "探索型カタリスト",
    catch: "本音の触媒",
    description:
      "率直な問いを投げかけ、多様な本音を場に引き出す触媒のようなスタイルです。停滞した議論に風穴を開けます。",
    nextStep:
      "場に出した本音を、その後どう受け止め束ねるかまで関わると、触媒が実を結びます。",
  },
  "direct-relational-wet-align": {
    name: "求心型カタリスト",
    catch: "面倒見のいい兄貴分／姉御肌",
    description:
      "率直で面倒見がよく、人をまとめて引っ張っていくスタイルです。距離の近さと言葉のまっすぐさで信頼を集めます。",
    nextStep:
      "引っ張る場面が続いたら、相手に任せて待つ間合いも織り交ぜると、周囲が育ちます。",
  },
  "direct-relational-wet-diverge": {
    name: "共感型カタリスト",
    catch: "率直な世話役",
    description:
      "温かく率直に接しながら、多様な人をつなぎ、それぞれを活かしていくスタイルです。人の違いを場の力に変えます。",
    nextStep:
      "世話を焼く相手が増えたら、自分の抱え込みにも目を向けて手放す線を引きましょう。",
  },

  // ── mediating × task（コーディネーター） ──────────────────────────
  "mediating-task-dry-align": {
    name: "収束型コーディネーター",
    catch: "冷静な取りまとめ役",
    description:
      "物腰やわらかく、冷静に課題を一つのまとまりへ収束させていくスタイルです。角を立てずに合意を形にします。",
    nextStep:
      "まとめる前に、あえて反対意見を一度引き出しておくと、合意がより堅くなります。",
  },
  "mediating-task-dry-diverge": {
    name: "探索型コーディネーター",
    catch: "静かな戦略家",
    description:
      "静かに論点を広げ、俯瞰の視点から課題を捌いていくスタイルです。全体を見渡して筋道を組み立てます。",
    nextStep:
      "俯瞰で見えた筋を、早めに言葉にして周囲へ共有すると、戦略が動き出します。",
  },
  "mediating-task-wet-align": {
    name: "求心型コーディネーター",
    catch: "温和な旗振り役",
    description:
      "温和に人を巻き込みながら、課題を一つの方向へ前進させていくスタイルです。穏やかさで人を動かします。",
    nextStep:
      "穏やかに進めるなかでも、譲れない一線は率直に示すと、方向がぶれにくくなります。",
  },
  "mediating-task-wet-diverge": {
    name: "共感型コーディネーター",
    catch: "包容力ある推進役",
    description:
      "包容力をもって多様さを受け止めつつ、課題を前へ進めていくスタイルです。違いを抱えたまま歩を進めます。",
    nextStep:
      "受け止める幅が広いぶん、どこかで優先順位を決める区切りを置くと、推進が速まります。",
  },

  // ── mediating × relational（ハーモナイザー） ──────────────────────
  "mediating-relational-dry-align": {
    name: "収束型ハーモナイザー",
    catch: "穏やかなまとめ役",
    description:
      "穏やかに、そして冷静に場の足並みを揃えていくスタイルです。感情の波を抑え、落ち着いたまとまりを作ります。",
    nextStep:
      "揃えることに加え、少数の違和感を拾い上げる問いを足すと、まとまりに深みが出ます。",
  },
  "mediating-relational-dry-diverge": {
    name: "探索型ハーモナイザー",
    catch: "聞き上手な調停者",
    description:
      "聞き上手で、多様な立場それぞれに居場所を作っていくスタイルです。静かに耳を傾け、場の緊張をほぐします。",
    nextStep:
      "聴いて受け止めたあと、自分の見立ても一言添えると、調停に芯が通ります。",
  },
  "mediating-relational-wet-align": {
    name: "求心型ハーモナイザー",
    catch: "和を紡ぐまとめ役",
    description:
      "人の機微に細やかに配慮し、温かく足並みを揃えていくスタイルです。関係の糸を紡いで場をまとめます。",
    nextStep:
      "和を大切にしつつ、対立を避けすぎていないか折々に振り返ると、まとまりが強くなります。",
  },
  "mediating-relational-wet-diverge": {
    name: "共感型ハーモナイザー",
    catch: "懐の深い橋渡し役",
    description:
      "温かく人と人をつなぎ、多様な意見それぞれの居場所を作っていくスタイルです。懐の深さで橋を架けます。",
    nextStep:
      "橋を架けることに加え、どこへ渡すかという方向づけも担うと、つながりが前へ進みます。",
  },
};

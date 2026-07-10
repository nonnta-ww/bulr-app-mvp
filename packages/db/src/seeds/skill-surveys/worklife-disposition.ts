/**
 * 働き方の志向診断 シードデータ（jobType/kind='worklife-disposition'）
 *
 * spec: .kiro/specs/worklife-disposition-survey（設計駆動・正本 CSV なし、design.md が正本）
 *
 * 構成: 5志向カテゴリ（改善志向／障害対応志向／育成志向／調整・橋渡し志向／新技術採用志向）
 * × 各4問の 5段階 Likert（`single_choice`・`scoringKind='polarity'`・level 0..4）。
 *
 * 変換規約（playstyle 踏襲・ただし reverse なし）:
 *  - 各設問は natural（肯定表現）のみ。「その志向をどれだけ重視・志向するか」の単一方向の同意強度で、
 *    playstyle/thinking-style のような両極対立軸ではないため reverse は採用しない（design.md score.ts 注記）。
 *  - stored level が高いほど「その志向が強い」。maxLevel=4。
 *  - `subcategory` は非 null（`'働き方の志向'`）— (survey,name,subcategory) 一意キーの冪等性を担保。
 *  - `kind='worklife_disposition'`（survey_kind enum に追加済み）。`scoringKind='polarity'`（既存 enum 値を再利用）。
 *
 * カテゴリ名は app 側 `WORKLIFE_DISPOSITION_CATEGORY_MAP` の安定キーのため変更しない。
 *
 * Boundary: seeds/skill-surveys/worklife-disposition.ts
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';
import type { SkillSurveySeedData } from './runner';

/** 5段階 Likert（natural: level が高いほど同意＝その志向が強い）。 */
const NATURAL_LIKERT: Array<{ text: string; displayOrder: number; level: number }> = [
  { text: '全くそう思わない', displayOrder: 0, level: 0 },
  { text: 'あまりそう思わない', displayOrder: 1, level: 1 },
  { text: 'どちらとも言えない', displayOrder: 2, level: 2 },
  { text: 'ややそう思う', displayOrder: 3, level: 3 },
  { text: '強くそう思う', displayOrder: 4, level: 4 },
];

/** natural Likert の single_choice / polarity 設問を組み立てるヘルパ。 */
function likertQuestion(
  text: string,
  displayOrder: number,
): SkillSurveySeedData['categories'][number]['questions'][number] {
  return {
    text,
    questionType: 'single_choice',
    scoringKind: 'polarity',
    isRequired: true,
    displayOrder,
    choices: NATURAL_LIKERT,
  };
}

/** 志向カテゴリ（subcategory は共通の '働き方の志向'）を組み立てるヘルパ。 */
function dispositionCategory(
  name: string,
  displayOrder: number,
  questions: string[],
): SkillSurveySeedData['categories'][number] {
  return {
    name,
    subcategory: '働き方の志向',
    displayOrder,
    questions: questions.map((text, i) => likertQuestion(text, i)),
  };
}

export const worklifeDispositionSurveySeed: SkillSurveySeedData = {
  jobType: 'worklife-disposition',
  kind: 'worklife_disposition',
  title: '働き方の志向診断',
  categories: [
    dispositionCategory('改善志向', 0, [
      '既存のやり方に満足せず、より良い方法を探して改善することにやりがいを感じる。',
      'プロセスや仕組みのムダを見つけて、継続的に効率化するのが好きだ。',
      '数値やデータで現状を把握し、改善の効果を検証することを重視する。',
      '一度作った仕組みも、定期的に見直してより良くしていきたい。',
    ]),
    dispositionCategory('障害対応志向', 1, [
      '障害やトラブルが起きたとき、率先して対応にあたることにやりがいを感じる。',
      '緊急のインシデントでも、冷静に原因を切り分けて素早く復旧させたい。',
      '予期せぬ問題への即応や、火消し役を担うことを厭わない。',
      '障害の再発防止策を考え、次に備えることを重視する。',
    ]),
    dispositionCategory('育成志向', 2, [
      '後輩やメンバーの成長を支援することに、大きなやりがいを感じる。',
      '自分の知識や経験を、チームに惜しみなく共有したい。',
      '相手の理解度に合わせて教えたり、フィードバックすることが好きだ。',
      'チーム全体のスキルの底上げに貢献したいと考えている。',
    ]),
    dispositionCategory('調整・橋渡し志向', 3, [
      '立場の異なる人たちの間に立って、調整・橋渡しをすることにやりがいを感じる。',
      '意見の対立があるとき、双方の落としどころを見つけるのが得意だ。',
      '複数のチームや部門をつないで、物事を前に進めることを重視する。',
      '関係者の期待値をすり合わせ、円滑な合意形成を図ることが好きだ。',
    ]),
    dispositionCategory('新技術採用志向', 4, [
      '新しい技術やツールが登場すると、いち早く試してみたくなる。',
      '最新の技術トレンドを追いかけ、業務に取り入れることにやりがいを感じる。',
      '未経験の技術でも、積極的に学んで導入を推進したい。',
      '枯れた技術より、新しく可能性のある技術に挑戦することを好む。',
    ]),
  ],
};

/**
 * 働き方の志向診断の seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runWorklifeDispositionSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, worklifeDispositionSurveySeed, {
    logLabel: 'worklife-disposition',
  });
}

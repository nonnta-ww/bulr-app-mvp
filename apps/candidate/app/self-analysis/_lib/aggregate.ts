/**
 * 決定論的集計ロジック（純関数）
 *
 * skill-survey 回答からカテゴリ別カバレッジ・選択の広さ・自由記述の有無・
 * 全体網羅度を算出する。副作用・I/O・乱数・時刻参照は一切持たない。
 * 同一入力に対し常に同一の AggregatedSnapshot を返す（Req 2.2）。
 * 数値スコアによる序列化・他者比較を含めない（Req 2.3）。
 *
 * Boundary: aggregate
 * Requirements: 2.1, 2.2, 2.3
 */

import type { AggregatedSnapshot } from '@bulr/db';
import type { SurveyResponseForAnalysis } from '@bulr/db';

/**
 * skill-survey 回答を受け取り決定論的な集計スナップショットを返す純関数。
 *
 * 各カテゴリの算出ルール:
 * - answeredQuestions: 選択肢を1つ以上選択 OR 自由記述が空でない設問の数
 * - totalQuestions:    source の当該カテゴリ totalQuestions（マスタ総数）
 * - coverageRatio:     totalQuestions > 0 ? answeredQuestions / totalQuestions : 0
 * - selectedBreadth:   そのカテゴリ全回答の selectedLabels 長さの合計
 * - freeTextPresence:  いずれかの回答に空でない freeText があるか
 *
 * overallCoverageRatio:
 *   全カテゴリの answeredQuestions 合計 / 全カテゴリの totalQuestions 合計（0 除算ガード）
 */
export function aggregate(source: SurveyResponseForAnalysis): AggregatedSnapshot {
  let totalAnsweredSum = 0;
  let totalQuestionsSum = 0;

  const categories = source.categories.map((category) => {
    const { categoryName, totalQuestions, answers } = category;

    let answeredQuestions = 0;
    let selectedBreadth = 0;
    let freeTextPresence = false;

    for (const answer of answers) {
      const hasSelection = answer.selectedLabels.length > 0;
      const hasFreeText = answer.freeText !== null && answer.freeText !== '';

      if (hasSelection || hasFreeText) {
        answeredQuestions += 1;
      }

      selectedBreadth += answer.selectedLabels.length;

      if (hasFreeText) {
        freeTextPresence = true;
      }
    }

    const coverageRatio = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;

    totalAnsweredSum += answeredQuestions;
    totalQuestionsSum += totalQuestions;

    return {
      categoryName,
      answeredQuestions,
      totalQuestions,
      coverageRatio,
      selectedBreadth,
      freeTextPresence,
    };
  });

  const overallCoverageRatio =
    totalQuestionsSum > 0 ? totalAnsweredSum / totalQuestionsSum : 0;

  return {
    jobType: source.jobType,
    categories,
    overallCoverageRatio,
  };
}

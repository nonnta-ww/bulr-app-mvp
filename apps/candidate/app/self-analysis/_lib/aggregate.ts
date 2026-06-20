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
 * 各カテゴリの算出ルール（同名カテゴリは subcategory をまたいで1つに集約する）:
 * - answeredQuestions: 選択肢を1つ以上選択 OR 自由記述が空でない設問の数（同名カテゴリ合算）
 * - totalQuestions:    source の当該カテゴリ totalQuestions（マスタ総数、同名カテゴリ合算）
 * - coverageRatio:     totalQuestions > 0 ? answeredQuestions / totalQuestions : 0
 * - selectedBreadth:   そのカテゴリ全回答の selectedLabels 長さの合計（同名カテゴリ合算）
 * - freeTextPresence:  いずれかの回答に空でない freeText があるか（同名カテゴリで OR）
 *
 * マスタは (name, subcategory) 単位でカテゴリ行を持つため categoryName が重複し得る。
 * 自己分析の可視化はカテゴリ名単位の網羅度マップとして提示するため、同名カテゴリを
 * 1エントリに集約する（重複バー・React の重複 key を防ぐ）。挿入順を保持する。
 *
 * overallCoverageRatio:
 *   全カテゴリの answeredQuestions 合計 / 全カテゴリの totalQuestions 合計（0 除算ガード）
 *
 * proficiency-scale で追加する熟練度・直近利用（既存指標とは独立, Req 5.1-5.4）:
 * - proficiencyScore:        scoringKind='proficiency' 回答の selectedLevels 平均を
 *                            MAX_LEVEL=3 基準で 0..100 へ正規化し四捨五入。寄与0件なら null。
 * - answeredProficiencyCount: 熟練度に寄与した設問数（level を解決できた proficiency 回答数）。
 * - recencyOrdinal/recencyLabel: scoringKind='recency' 回答の選択 level の最大（=最新）と
 *                            その表示ラベル。recency 回答が無ければ null。熟練度平均には混ぜない。
 */
const MAX_LEVEL = 3;

interface MergedCategory {
  answeredQuestions: number;
  totalQuestions: number;
  selectedBreadth: number;
  freeTextPresence: boolean;
  proficiencyLevelSum: number;
  proficiencyLevelCount: number;
  answeredProficiencyCount: number;
  recencyOrdinal: number | null;
  recencyLabel: string | null;
}

export function aggregate(source: SurveyResponseForAnalysis): AggregatedSnapshot {
  let totalAnsweredSum = 0;
  let totalQuestionsSum = 0;

  // categoryName ごとに集約（Map は挿入順を保持）
  const merged = new Map<string, MergedCategory>();

  for (const category of source.categories) {
    const { categoryName, totalQuestions, answers } = category;

    let answeredQuestions = 0;
    let selectedBreadth = 0;
    let freeTextPresence = false;
    let proficiencyLevelSum = 0;
    let proficiencyLevelCount = 0;
    let answeredProficiencyCount = 0;
    let recencyOrdinal: number | null = null;
    let recencyLabel: string | null = null;

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

      // 熟練度・直近利用は独立系統で集計（旧データは scoringKind/selectedLevels が
      // 欠落し得るため null 安全に扱う, Req 5.4）。
      const selectedLevels = answer.selectedLevels ?? [];
      if (answer.scoringKind === 'proficiency') {
        if (selectedLevels.length > 0) {
          answeredProficiencyCount += 1;
          for (const level of selectedLevels) {
            proficiencyLevelSum += level;
            proficiencyLevelCount += 1;
          }
        }
      } else if (answer.scoringKind === 'recency') {
        // 選択 level の最大（=最新）を採用。selectedLabels と selectedLevels は
        // recency 設問（全選択肢に level）では添字対応する。
        selectedLevels.forEach((level, i) => {
          if (recencyOrdinal === null || level > recencyOrdinal) {
            recencyOrdinal = level;
            recencyLabel = answer.selectedLabels[i] ?? null;
          }
        });
      }
    }

    totalAnsweredSum += answeredQuestions;
    totalQuestionsSum += totalQuestions;

    const existing = merged.get(categoryName);
    if (existing) {
      existing.answeredQuestions += answeredQuestions;
      existing.totalQuestions += totalQuestions;
      existing.selectedBreadth += selectedBreadth;
      existing.freeTextPresence = existing.freeTextPresence || freeTextPresence;
      existing.proficiencyLevelSum += proficiencyLevelSum;
      existing.proficiencyLevelCount += proficiencyLevelCount;
      existing.answeredProficiencyCount += answeredProficiencyCount;
      if (recencyOrdinal !== null && (existing.recencyOrdinal === null || recencyOrdinal > existing.recencyOrdinal)) {
        existing.recencyOrdinal = recencyOrdinal;
        existing.recencyLabel = recencyLabel;
      }
    } else {
      merged.set(categoryName, {
        answeredQuestions,
        totalQuestions,
        selectedBreadth,
        freeTextPresence,
        proficiencyLevelSum,
        proficiencyLevelCount,
        answeredProficiencyCount,
        recencyOrdinal,
        recencyLabel,
      });
    }
  }

  const categories = Array.from(merged.entries()).map(([categoryName, v]) => ({
    categoryName,
    answeredQuestions: v.answeredQuestions,
    totalQuestions: v.totalQuestions,
    coverageRatio: v.totalQuestions > 0 ? v.answeredQuestions / v.totalQuestions : 0,
    selectedBreadth: v.selectedBreadth,
    freeTextPresence: v.freeTextPresence,
    proficiencyScore:
      v.proficiencyLevelCount > 0
        ? Math.round((v.proficiencyLevelSum / v.proficiencyLevelCount / MAX_LEVEL) * 100)
        : null,
    answeredProficiencyCount: v.answeredProficiencyCount,
    recencyOrdinal: v.recencyOrdinal,
    recencyLabel: v.recencyLabel,
  }));

  const overallCoverageRatio =
    totalQuestionsSum > 0 ? totalAnsweredSum / totalQuestionsSum : 0;

  return {
    jobType: source.jobType,
    categories,
    overallCoverageRatio,
  };
}

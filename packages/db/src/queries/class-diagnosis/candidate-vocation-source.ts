/**
 * candidate-vocation-source — 候補者職掌ソースの横断取得（RPG クラス診断）
 *
 * 候補者が回答済みの `kind='skill'` の skill-survey のみを対象に（playstyle は除外）、
 * 各 survey の最新 response を読み、カテゴリ別の寄与スコアを職掌フォールディング用に返す。
 * self_analysis の生成有無には依存しない（Req 1.1, 1.2, 8.1）。
 *
 * 各カテゴリの寄与スコアは決定論的フォールバックで正規化する:
 *   categoryScore = proficiencyScore ?? frequencyScore ?? round(coverageRatio * 100)
 * これにより proficiency 系設問を持たない職掌（賢者 / 指揮 / 遊撃）が構造的に
 * 0 固定で過小評価されるのを防ぐ。answeredCount=0 のカテゴリは寄与に数えない（categoryScore=null）。
 *
 * 依存方向: packages/db は apps/* / packages/ai を import しない。既存 db クエリ
 *   getLatestSurveyResponseForAnalysis と自己分析の集計規則のみを再利用する。
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../client';
import { skillSurvey } from '../../schema/skill-survey';
import { skillSurveyResponse } from '../../schema/skill-survey-response';
import {
  getLatestSurveyResponseForAnalysis,
  type SurveyResponseForAnalysis,
} from '../self-analysis/analysis-source-query';

// ---------------------------------------------------------------------------
// 出力型定義
// ---------------------------------------------------------------------------

export interface CandidateVocationSource {
  surveys: Array<{
    surveyId: string;
    jobType: string;
    responseId: string;
    submittedAt: Date;
    overallCoverageRatio: number;
  }>;
  /**
   * (surveyId, categoryName) 単位のカテゴリ別寄与。
   * categoryScore は proficiency→frequency→coverage フォールバックで解決した 0..100（null=非寄与）。
   * jobType は cross-survey で同名カテゴリが衝突する場合の識別に必須（foldVocations / task 3.1）。
   */
  categories: Array<{
    surveyId: string;
    jobType: string;
    categoryName: string;
    categoryScore: number | null;
    answeredCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// カテゴリ集計ヘルパー
// ---------------------------------------------------------------------------

/**
 * MAX_LEVEL は apps/candidate/app/self-analysis/_lib/aggregate.ts の MAX_LEVEL と一致させること。
 * level 序数（1..MAX_LEVEL）を 0..100 スコアへ正規化する基準値。
 */
const MAX_LEVEL = 3;

interface AggregatedCategory {
  jobType: string;
  categoryName: string;
  categoryScore: number | null;
  answeredCount: number;
}

/**
 * この関数は apps/candidate/app/self-analysis/_lib/aggregate.ts の
 * proficiency / frequency / coverage 算出規則をミラーする（依存方向の制約により
 * app 側 aggregate() を import できないため db 内で複製）。両者は同期を保つこと:
 *   - MAX_LEVEL = 3（level 正規化基準）
 *   - proficiencyScore: scoringKind='proficiency' 回答の selectedLevels 平均を /MAX_LEVEL*100 で四捨五入、寄与0なら null
 *   - frequencyScore:   scoringKind='frequency' 回答の selectedLevels 平均を同様に正規化、寄与0なら null
 *   - coverageRatio:    answeredQuestions / totalQuestions（answeredQuestions = selectedLabel を1つ以上 OR 非空 freeText）
 *   - 同名カテゴリは subcategory をまたいで 1 エントリに集約（挿入順を保持）
 * ここでは追加で categoryScore を proficiency→frequency→coverage フォールバックで解決する。
 */
function aggregateCategories(source: SurveyResponseForAnalysis): {
  categories: AggregatedCategory[];
  overallCoverageRatio: number;
} {
  interface Merged {
    answeredQuestions: number;
    totalQuestions: number;
    proficiencyLevelSum: number;
    proficiencyLevelCount: number;
    frequencyLevelSum: number;
    frequencyLevelCount: number;
  }

  let totalAnsweredSum = 0;
  let totalQuestionsSum = 0;

  // categoryName ごとに集約（Map は挿入順を保持）
  const merged = new Map<string, Merged>();

  for (const category of source.categories) {
    const { categoryName, totalQuestions, answers } = category;

    let answeredQuestions = 0;
    let proficiencyLevelSum = 0;
    let proficiencyLevelCount = 0;
    let frequencyLevelSum = 0;
    let frequencyLevelCount = 0;

    for (const answer of answers) {
      const hasSelection = answer.selectedLabels.length > 0;
      const hasFreeText = answer.freeText !== null && answer.freeText !== '';

      if (hasSelection || hasFreeText) {
        answeredQuestions += 1;
      }

      const selectedLevels = answer.selectedLevels ?? [];
      if (answer.scoringKind === 'proficiency') {
        for (const level of selectedLevels) {
          proficiencyLevelSum += level;
          proficiencyLevelCount += 1;
        }
      } else if (answer.scoringKind === 'frequency') {
        for (const level of selectedLevels) {
          frequencyLevelSum += level;
          frequencyLevelCount += 1;
        }
      }
      // recency / polarity など他の scoringKind は職掌寄与スコアには使わない。
    }

    totalAnsweredSum += answeredQuestions;
    totalQuestionsSum += totalQuestions;

    const existing = merged.get(categoryName);
    if (existing) {
      existing.answeredQuestions += answeredQuestions;
      existing.totalQuestions += totalQuestions;
      existing.proficiencyLevelSum += proficiencyLevelSum;
      existing.proficiencyLevelCount += proficiencyLevelCount;
      existing.frequencyLevelSum += frequencyLevelSum;
      existing.frequencyLevelCount += frequencyLevelCount;
    } else {
      merged.set(categoryName, {
        answeredQuestions,
        totalQuestions,
        proficiencyLevelSum,
        proficiencyLevelCount,
        frequencyLevelSum,
        frequencyLevelCount,
      });
    }
  }

  const categories: AggregatedCategory[] = Array.from(merged.entries()).map(([categoryName, v]) => {
    const proficiencyScore =
      v.proficiencyLevelCount > 0
        ? Math.round((v.proficiencyLevelSum / v.proficiencyLevelCount / MAX_LEVEL) * 100)
        : null;
    const frequencyScore =
      v.frequencyLevelCount > 0
        ? Math.round((v.frequencyLevelSum / v.frequencyLevelCount / MAX_LEVEL) * 100)
        : null;
    const coverageRatio = v.totalQuestions > 0 ? v.answeredQuestions / v.totalQuestions : 0;

    // answeredQuestions=0 のカテゴリは非寄与（categoryScore=null）。
    const categoryScore =
      v.answeredQuestions > 0
        ? (proficiencyScore ?? frequencyScore ?? Math.round(coverageRatio * 100))
        : null;

    return {
      jobType: source.jobType,
      categoryName,
      categoryScore,
      answeredCount: v.answeredQuestions,
    };
  });

  const overallCoverageRatio = totalQuestionsSum > 0 ? totalAnsweredSum / totalQuestionsSum : 0;

  return { categories, overallCoverageRatio };
}

// ---------------------------------------------------------------------------
// クエリ実装
// ---------------------------------------------------------------------------

/**
 * 候補者が回答済みの kind='skill' skill-survey を横断し、各 survey の最新 response を
 * カテゴリ別寄与スコアで返す。playstyle survey は除外する（Issue1）。
 * 本人（candidateProfileId）のデータのみを対象にする。
 * 未回答の候補者には `{ surveys: [], categories: [] }` を返す（Req 8.1）。
 *
 * @param candidateProfileId - 認証済み候補者の profile ID（本人限定）
 */
export async function getCandidateVocationSource(
  candidateProfileId: string,
): Promise<CandidateVocationSource> {
  // 候補者が回答した kind='skill' の survey（surveyId + jobType）を distinct 列挙。
  // skill_survey_response ⨝ skill_survey で kind フィルタ（playstyle 除外）と本人フィルタを掛ける。
  const answeredRows = await db
    .selectDistinct({
      surveyId: skillSurvey.id,
      jobType: skillSurvey.jobType,
    })
    .from(skillSurveyResponse)
    .innerJoin(skillSurvey, eq(skillSurveyResponse.skillSurveyId, skillSurvey.id))
    .where(
      and(
        eq(skillSurveyResponse.candidateProfileId, candidateProfileId),
        eq(skillSurvey.kind, 'skill'),
      ),
    );

  const surveys: CandidateVocationSource['surveys'] = [];
  const categories: CandidateVocationSource['categories'] = [];

  for (const { surveyId } of answeredRows) {
    // 最新 response を取得（本人フィルタ込み）。response が無ければ skip。
    const source = await getLatestSurveyResponseForAnalysis(candidateProfileId, surveyId);
    if (!source) {
      continue;
    }

    const { categories: aggregated, overallCoverageRatio } = aggregateCategories(source);

    surveys.push({
      surveyId: source.surveyId,
      jobType: source.jobType,
      responseId: source.responseId,
      submittedAt: source.submittedAt,
      overallCoverageRatio,
    });

    for (const cat of aggregated) {
      categories.push({
        surveyId: source.surveyId,
        jobType: cat.jobType,
        categoryName: cat.categoryName,
        categoryScore: cat.categoryScore,
        answeredCount: cat.answeredCount,
      });
    }
  }

  return { surveys, categories };
}

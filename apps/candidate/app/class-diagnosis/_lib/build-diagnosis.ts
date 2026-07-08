/**
 * RPG クラス診断 — 決定論的オーケストレーション（純関数, task 7）。
 *
 * DB クエリ結果（CandidateVocationSource / playstyle の SurveyResponseForAnalysis）を
 * 判定純関数（foldVocations → scoreTemperament → resolveTitle → assembleClass）に流し込み、
 * ClassResult・版署名・スナップショット・フレーバー用回答を組み立てる。
 *
 * ここは DB/LLM/auth に一切依存しない純関数の集合（テスト＝振る舞い）。副作用なし・同一入力→同一出力。
 * Server Action（generate-class-diagnosis.ts）はこれらを組み合わせるだけの薄いラッパとする。
 *
 * 契約:
 *  - 職掌ベクトル: CandidateVocationSource.categories を VocationInput へ写像（jobType 併記, task 3.1）。
 *  - 気質: playstyle 回答のカテゴリ名 → 軸（app core answers.ts の PLAYSTYLE_CATEGORY_AXIS）へ写像し
 *    scoreTemperament（partial 対応・常に profile を返す）で採点する。standalone と同一の単一ソースを共有（R7.1）。
 *  - playstyle 未回答（null / 空）→ profile.completeness==='none' → assembleClass が temperament=null へ（partial 診断, R8.2）。
 *  - 版署名（sourceSignature）: 寄与 skill responseId をソート後、playstyle responseId（or '-'）を付す。
 */

import type {
  ClassResult,
  ClassDiagnosisSourceSnapshot,
} from '@bulr/types';
import type { CandidateVocationSource, SurveyResponseForAnalysis } from '@bulr/db';

import { foldVocations, type VocationInput } from './vocation';
import { resolveTitle } from './title';
import { assembleClass } from './assemble';
import { mapTemperamentAnswers, PLAYSTYLE_CATEGORY_AXIS } from '../../_lib/temperament/answers';
import { scoreTemperament } from '../../_lib/temperament/score';

// 気質軸への写像（PLAYSTYLE_CATEGORY_AXIS）と回答束の写像（mapTemperamentAnswers）は
// app core `_lib/temperament/answers.ts`（standalone と共有する単一ソース, R7.1）へ移管済み。
// クラス診断はここから re-export して従来の公開面を保つ。
export { mapTemperamentAnswers, PLAYSTYLE_CATEGORY_AXIS };

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** playstyle 未回答時の版署名センチネル（responseId の代わり）。 */
const PLAYSTYLE_SENTINEL = '-';

// ---------------------------------------------------------------------------
// 職掌入力の写像
// ---------------------------------------------------------------------------

/**
 * CandidateVocationSource を foldVocations の入力（VocationInput）へ写像する。
 * categoryScore / answeredCount / jobType / categoryName をそのまま引き渡す（passthrough）。
 */
export function mapVocationInput(source: CandidateVocationSource): VocationInput {
  return {
    categories: source.categories.map((c) => ({
      jobType: c.jobType,
      categoryName: c.categoryName,
      categoryScore: c.categoryScore,
      answeredCount: c.answeredCount,
    })),
  };
}

// ---------------------------------------------------------------------------
// 版署名
// ---------------------------------------------------------------------------

/**
 * 診断入力の版署名（sourceSignature）を決定論的に組み立てる。
 *
 * 寄与 skill responseId をソート（順序非依存）した後、playstyle responseId（null なら '-'）を
 * 付し、'|' で連結する。同一入力 → 同一署名。skill responseId の並び順に依存しない。
 */
export function buildSourceSignature(
  source: CandidateVocationSource,
  playstyleResponseId: string | null,
): string {
  const skillResponseIds = source.surveys.map((s) => s.responseId).sort();
  return [...skillResponseIds, playstyleResponseId ?? PLAYSTYLE_SENTINEL].join('|');
}

// ---------------------------------------------------------------------------
// スナップショット
// ---------------------------------------------------------------------------

/**
 * 陳腐化判定用の診断入力スナップショット（ClassDiagnosisSourceSnapshot）を組み立てる。
 * 寄与 skill response（surveyId/responseId/submittedAt/coverage）と playstyle response の
 * responseId / submittedAt（null 可）を記録する。
 */
export function buildSourceSnapshot(
  source: CandidateVocationSource,
  playstyle: SurveyResponseForAnalysis | null,
): ClassDiagnosisSourceSnapshot {
  return {
    skillResponses: source.surveys.map((s) => ({
      surveyId: s.surveyId,
      responseId: s.responseId,
      submittedAt: s.submittedAt.toISOString(),
      overallCoverageRatio: s.overallCoverageRatio,
    })),
    playstyleResponseId: playstyle?.responseId ?? null,
    playstyleSubmittedAt: playstyle?.submittedAt.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// クラス判定
// ---------------------------------------------------------------------------

/**
 * 職掌ソース + playstyle 回答から ClassResult を決定論的に組み立てる（R1.1/7.2/8.2/8.3/12.2）。
 *
 * foldVocations → scoreTemperament（常に profile を返す・partial 対応）→ resolveTitle → assembleClass。
 * playstyle 未回答時は profile.completeness==='none' となり assembleClass が temperament=null の
 * partial 診断へ落とす（confidence は totalAnswered で決まる）。
 */
export function computeClassResult(
  source: CandidateVocationSource,
  playstyle: SurveyResponseForAnalysis | null,
): ClassResult {
  const vocationResult = foldVocations(mapVocationInput(source));
  const profile = scoreTemperament(mapTemperamentAnswers(playstyle));
  const titleResult = resolveTitle(vocationResult);
  return assembleClass(vocationResult, profile, titleResult);
}

// ---------------------------------------------------------------------------
// フレーバー用回答
// ---------------------------------------------------------------------------

/** generateClassFlavor の answers に渡す最小形（カテゴリ名 + 選択ラベル + 自由記述）。 */
export interface FlavorAnswer {
  categoryName: string;
  selectedLabels: string[];
  freeText: string | null;
}

/**
 * フレーバー生成の grounding 用回答を組み立てる。
 *
 * CandidateVocationSource はスコアのみでラベルを持たないため、ラベル付き回答は playstyle
 * 回答（SurveyResponseForAnalysis）から取得する。skill 側のラベルは grounding に含めない
 * （getCandidateVocationSource はラベルを返さず、per-survey の再取得は task スコープ外）。
 * フレーバーは playstyle 回答ラベル + ClassResult のラベル（className/職掌/気質/称号）で
 * 十分に grounding される。playstyle 未回答時は空配列（フレーバーはクラス判定ラベルのみで生成）。
 */
export function buildFlavorAnswers(playstyle: SurveyResponseForAnalysis | null): FlavorAnswer[] {
  if (!playstyle) {
    return [];
  }
  return playstyle.categories.flatMap((category) =>
    category.answers.map((answer) => ({
      categoryName: answer.categoryName,
      selectedLabels: answer.selectedLabels,
      freeText: answer.freeText,
    })),
  );
}

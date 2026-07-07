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
 *  - 気質: playstyle 回答のカテゴリ名 → 軸（PLAYSTYLE_CATEGORY_AXIS）へ写像。seed（task 5）は
 *    「stored level が高いほど第2極寄り」に正規化済みのため reverse=false・maxLevel=4 で渡す。
 *  - playstyle 未回答（null / 空）→ 気質 null（partial 診断, R8.2）。
 *  - 版署名（sourceSignature）: 寄与 skill responseId をソート後、playstyle responseId（or '-'）を付す。
 */

import type {
  ClassResult,
  TemperamentAxis,
  ClassDiagnosisSourceSnapshot,
} from '@bulr/types';
import type { CandidateVocationSource, SurveyResponseForAnalysis } from '@bulr/db';

import { foldVocations, type VocationInput } from './vocation';
import { scoreTemperament, type TemperamentAnswer } from './temperament';
import { resolveTitle } from './title';
import { assembleClass } from './assemble';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * playstyle seed（task 5）のカテゴリ名 → 気質軸の対応（seed 契約）。
 * カテゴリ名は seed 側で安定キーとして固定されている（playstyle.ts のコメント参照）。
 */
export const PLAYSTYLE_CATEGORY_AXIS: Record<string, TemperamentAxis> = {
  探索と深化: 'explorationDeepening',
  個人と協調: 'soloCollaboration',
};

/**
 * playstyle Likert の最大 level（0..4 の 5 段階）。seed（task 5）と一致させること。
 */
const PLAYSTYLE_MAX_LEVEL = 4;

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
// 気質入力の写像
// ---------------------------------------------------------------------------

/**
 * playstyle 回答束を scoreTemperament の入力（TemperamentAnswer[]）へ写像する。
 *
 * カテゴリ名が PLAYSTYLE_CATEGORY_AXIS に解決でき、かつ selectedLevels が非空の回答のみを対象に
 * `{ axis, level: selectedLevels[0], reverse: false, maxLevel: 4 }` を emit する。
 * seed が「高 level = 第2極寄り」に正規化済みのため reverse は常に false。
 * playstyle が null / 対象回答なし → 空配列（→ scoreTemperament が null を返し partial 診断, R8.2）。
 */
export function mapTemperamentAnswers(
  playstyle: SurveyResponseForAnalysis | null,
): TemperamentAnswer[] {
  if (!playstyle) {
    return [];
  }

  const result: TemperamentAnswer[] = [];
  for (const category of playstyle.categories) {
    const axis = PLAYSTYLE_CATEGORY_AXIS[category.categoryName];
    if (!axis) {
      continue;
    }
    for (const answer of category.answers) {
      const level = answer.selectedLevels[0];
      if (level === undefined) {
        continue;
      }
      result.push({ axis, level, reverse: false, maxLevel: PLAYSTYLE_MAX_LEVEL });
    }
  }
  return result;
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
 * 職掌ソース + playstyle 回答から ClassResult を決定論的に組み立てる（R1.1/8.2/8.3/12.2）。
 *
 * foldVocations → scoreTemperament（playstyle 未回答なら null）→ resolveTitle → assembleClass。
 * playstyle 未回答時は temperament=null の partial 診断となる（confidence は totalAnswered で決まる）。
 */
export function computeClassResult(
  source: CandidateVocationSource,
  playstyle: SurveyResponseForAnalysis | null,
): ClassResult {
  const vocationResult = foldVocations(mapVocationInput(source));
  const temperamentResult = scoreTemperament(mapTemperamentAnswers(playstyle));
  const titleResult = resolveTitle(vocationResult);
  return assembleClass(vocationResult, temperamentResult, titleResult);
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

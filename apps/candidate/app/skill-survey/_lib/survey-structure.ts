/**
 * survey-structure.ts — 純関数群（SurveyStructureLib）
 *
 * ウィザードのステップ構造と回答状態判定を form / result / progress 間で共有する。
 * 'use client' を付けない純 TS モジュール（Server Component / Client Component の双方から import 可）。
 *
 * Requirements: 8.1, 8.3, 9.5, 9.7, 9.8, 10.1, 11.2
 * Boundary: SurveyStructureLib
 */

import type { SkillSurveyCategory, SkillSurveyChoice, SkillSurveyQuestion } from '@bulr/db/schema';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 設問に選択肢を付帯させた型 */
export type QuestionWithChoices = SkillSurveyQuestion & { choices: SkillSurveyChoice[] };

/** カテゴリ行に設問群を付帯させた型 */
export type CategoryWithQuestions = SkillSurveyCategory & { questions: QuestionWithChoices[] };

/**
 * distinct category.name 単位の 1 ウィザードステップ。
 * 同名カテゴリの subcategory 行をサブグループとして束ねる。
 */
export interface SurveyStep {
  /** distinct category.name */
  categoryName: string;
  /** 0-based ステップインデックス（groupByCategoryName が付番） */
  stepIndex: number;
  /** サブカテゴリ → 設問のグループ（displayOrder 昇順） */
  subgroups: Array<{ subcategory: string | null; questions: QuestionWithChoices[] }>;
  /** このステップに含まれる全設問 ID の平坦なリスト */
  questionIds: string[];
}

/**
 * クライアント側で管理する設問ごとの回答状態。
 * null ではなく undefined を使い、未入力と明示的クリアを区別しない（内容ベース判定で十分）。
 */
export interface AnswerState {
  selectedChoiceIds?: string[];
  freeText?: string;
}

// ---------------------------------------------------------------------------
// groupByCategoryName
// ---------------------------------------------------------------------------

/**
 * CategoryWithQuestions[] を distinct `category.name` 単位の SurveyStep[] に変換する。
 *
 * - 同じ name を持つ category 行をまとめて 1 ステップにする
 * - 各ステップ内のサブグループは category 行の displayOrder 昇順で並ぶ
 * - ステップ順は、各 name グループの最小 displayOrder 昇順で安定
 *
 * Preconditions: categories は page.tsx の master query 由来（displayOrder 昇順推奨だが、本関数が自前でソートするため必須ではない）
 * Postconditions: 返す SurveyStep[] の順序は category.name の最小 displayOrder 昇順で安定
 */
export function groupByCategoryName(categories: CategoryWithQuestions[]): SurveyStep[] {
  // name ごとのグループを構築しつつ、そのグループが最初に登場したときの最小 displayOrder を記録する
  const nameOrder = new Map<string, number>(); // name → 最小 displayOrder
  const nameRows = new Map<string, CategoryWithQuestions[]>(); // name → category 行の配列

  for (const cat of categories) {
    const existing = nameOrder.get(cat.name);
    if (existing === undefined || cat.displayOrder < existing) {
      nameOrder.set(cat.name, cat.displayOrder);
    }
    const rows = nameRows.get(cat.name) ?? [];
    rows.push(cat);
    nameRows.set(cat.name, rows);
  }

  // 最小 displayOrder でステップ順をソート（安定ソート: TS の Array.sort は ES2019 以降安定）
  const sortedNames = [...nameOrder.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  return sortedNames.map((name, stepIndex) => {
    const rows = (nameRows.get(name) ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder);

    // サブカテゴリ行を displayOrder 昇順でサブグループ化
    const subgroups: Array<{ subcategory: string | null; questions: QuestionWithChoices[] }> =
      rows.map((row) => ({
        subcategory: row.subcategory,
        // 設問も displayOrder 昇順
        questions: row.questions.slice().sort((a, b) => a.displayOrder - b.displayOrder),
      }));

    // このステップ内の全設問 ID（サブグループ順 → 設問順）
    const questionIds = subgroups.flatMap((sg) => sg.questions.map((q) => q.id));

    return {
      categoryName: name,
      stepIndex,
      subgroups,
      questionIds,
    };
  });
}

// ---------------------------------------------------------------------------
// isAnswered
// ---------------------------------------------------------------------------

/**
 * 内容ベースの回答済み判定（単一の真実）。
 *
 * - single_choice / multi_choice: selectedChoiceIds に 1 件以上ある
 * - free_text: trimmed text が空でない
 *
 * answer 行（DB レコード）の有無では判定しない。
 * submit-survey.ts は未回答設問も全件 INSERT するため、行の有無と回答有無は一致しない。
 *
 * Invariants: progress バー（要件 8.3）/ result バッジ（11.2）/ 必須充足（9.x）はすべてこの関数を基準とする
 */
export function isAnswered(q: QuestionWithChoices, a: AnswerState | undefined): boolean {
  if (!a) return false;

  if (q.questionType === 'free_text') {
    return (a.freeText ?? '').trim().length > 0;
  }

  // single_choice / multi_choice
  return (a.selectedChoiceIds?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// isRequiredSatisfied
// ---------------------------------------------------------------------------

/**
 * 必須充足判定。
 *
 * - isRequired === false（または未設定）→ 常に true（任意設問は常に充足）
 * - isRequired === true → isAnswered と同基準
 */
export function isRequiredSatisfied(q: QuestionWithChoices, a: AnswerState | undefined): boolean {
  if (!q.isRequired) return true;
  return isAnswered(q, a);
}

// ---------------------------------------------------------------------------
// categoryStatus
// ---------------------------------------------------------------------------

/**
 * カテゴリ（ステップ）の回答状態。
 *
 * - 必須設問がある場合: 全必須設問が充足されていれば 'answered'
 * - 必須設問がない場合: isAnswered な設問が 1 問以上あれば 'answered'
 * - どちらでもなければ 'unanswered'
 *
 * progress と result が同一定義を参照する（単一の真実）。
 */
export function categoryStatus(
  step: SurveyStep,
  answers: Record<string, AnswerState>,
): 'answered' | 'unanswered' {
  const allQuestions = step.subgroups.flatMap((sg) => sg.questions);
  const requiredQuestions = allQuestions.filter((q) => q.isRequired);

  if (requiredQuestions.length > 0) {
    // 必須設問がある: 全必須充足で 'answered'
    const allSatisfied = requiredQuestions.every((q) => isRequiredSatisfied(q, answers[q.id]));
    return allSatisfied ? 'answered' : 'unanswered';
  }

  // 必須設問なし: isAnswered な設問が 1 問以上で 'answered'
  const anyAnswered = allQuestions.some((q) => isAnswered(q, answers[q.id]));
  return anyAnswered ? 'answered' : 'unanswered';
}

// ---------------------------------------------------------------------------
// answersToStateMap
// ---------------------------------------------------------------------------

/**
 * DB の answers 配列（getLatestResponseByCandidateProfileId 由来）を
 * questionId キーの Record<string, AnswerState> に正規化する。
 *
 * - selectedChoiceIds: null → undefined（AnswerState は undefined を使用）
 * - freeText: null → undefined
 *
 * result ページが progress と同じ型でヘルパー（isAnswered / categoryStatus）を使うためのアダプタ。
 */
export function answersToStateMap(
  answers: Array<{
    answer: {
      questionId: string;
      selectedChoiceIds: string[] | null;
      freeText: string | null;
    };
  }>,
): Record<string, AnswerState> {
  const map: Record<string, AnswerState> = {};

  for (const { answer } of answers) {
    map[answer.questionId] = {
      selectedChoiceIds: answer.selectedChoiceIds ?? undefined,
      freeText: answer.freeText ?? undefined,
    };
  }

  return map;
}

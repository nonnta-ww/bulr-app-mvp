'use client';

/**
 * スキルアンケート回答フォーム（Client Component）— ウィザード版
 *
 * distinct カテゴリ名単位のウィザードフォーム。
 * - groupByCategoryName() で SurveyStep[] を導出し、currentStepIndex で 1 ステップのみ描画
 * - 全ステップの回答を単一 answers state に保持（ステップ間で失われない）
 * - 「戻る」「次へ」「回答を送信する」を末尾に配置（最終ステップのみ送信ボタン）
 * - 「次へ」時: 当該ステップの必須設問を isRequiredSatisfied で検証 + free_text 2000 字超検証
 * - 「送信」時: 全ステップの必須設問を検証し、未充足ステップへ誘導
 * - 必須設問に赤 * を表示
 * - single_choice → radio / multi_choice → checkbox / free_text → textarea + 残り文字数
 * - サブカテゴリ見出しで設問をグルーピング
 * - 検証エラーは設問近傍にインライン表示
 * - 途中保存なし（リロード/離脱で未送信入力は破棄）
 *
 * Requirements: 8.1, 8.4, 8.5, 8.6, 8.7, 8.8, 9.4, 9.5, 9.7, 9.8,
 *               10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.4, 12.5
 * Boundary: SurveyFormComponent
 */

import { useEffect, useRef, useState, useTransition } from 'react';

import type {
  SkillSurvey,
} from '@bulr/db/schema';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db/queries';

import { submitSurvey } from '../[surveyId]/_actions/submit-survey';

import {
  groupByCategoryName,
  isRequiredSatisfied,
  type CategoryWithQuestions,
  type QuestionWithChoices,
  type SurveyStep,
  type AnswerState,
} from '../_lib/survey-structure';

// Re-export types for backward compatibility with page.tsx (structural aliases)
export type { CategoryWithQuestions, QuestionWithChoices };

import { SurveyProgress } from './survey-progress';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyFormProps {
  survey: SkillSurvey;
  categories: CategoryWithQuestions[];
  existingResponse: SkillSurveyResponseWithAnswers | null;
}

// ---------------------------------------------------------------------------
// Helper: build initial answer state from existingResponse
// ---------------------------------------------------------------------------

function buildInitialAnswers(
  categories: CategoryWithQuestions[],
  existingResponse: SkillSurveyResponseWithAnswers | null,
): Record<string, AnswerState> {
  const initial: Record<string, AnswerState> = {};

  for (const category of categories) {
    for (const question of category.questions) {
      initial[question.id] = {};
    }
  }

  if (existingResponse) {
    for (const { answer } of existingResponse.answers) {
      initial[answer.questionId] = {
        selectedChoiceIds: answer.selectedChoiceIds ?? undefined,
        freeText: answer.freeText ?? undefined,
      };
    }
  }

  return initial;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyForm({ survey, categories, existingResponse }: SurveyFormProps) {
  // Derive wizard steps once (stable across renders since categories prop is stable)
  const [steps] = useState<SurveyStep[]>(() => groupByCategoryName(categories));

  // Current wizard step index
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // All answers across all steps
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    buildInitialAnswers(categories, existingResponse),
  );

  // Per-question validation errors { [questionId]: message }
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form-level error message (server errors)
  const [formError, setFormError] = useState('');

  const [isPending, startTransition] = useTransition();

  // ステップ切り替え時にページ最上部へスクロールする。
  // ウィザードは 1 URL のクライアント遷移のため、ステップを進めてもスクロール位置が
  // 前ステップ下部（ボタン位置）のまま残り、次ステップの「回答を送信する」ボタンが
  // ほぼ同じ位置に来て誤って送信してしまう。ステップ変更時に即時で最上部へ戻し、
  // 次ステップの最初の設問から回答できるようにする（初回マウントは除外）。
  const isInitialStepRef = useRef(true);
  useEffect(() => {
    if (isInitialStepRef.current) {
      isInitialStepRef.current = false;
      return;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentStepIndex]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSingleChoice(questionId: string, choiceId: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { selectedChoiceIds: [choiceId] },
    }));
    clearFieldError(questionId);
  }

  function handleMultiChoice(questionId: string, choiceId: string, checked: boolean) {
    setAnswers((prev) => {
      const current = prev[questionId]?.selectedChoiceIds ?? [];
      const updated = checked
        ? [...current, choiceId]
        : current.filter((id) => id !== choiceId);
      return {
        ...prev,
        [questionId]: { selectedChoiceIds: updated },
      };
    });
    clearFieldError(questionId);
  }

  function handleFreeText(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { freeText: value },
    }));
    clearFieldError(questionId);
  }

  function clearFieldError(questionId: string) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate the given step's questions.
   * Returns { errors, hasErrors }.
   */
  function validateStep(step: SurveyStep): { errors: Record<string, string>; hasErrors: boolean } {
    const errors: Record<string, string> = {};

    for (const subgroup of step.subgroups) {
      for (const question of subgroup.questions) {
        const answer = answers[question.id];

        // free_text 2000 字超チェック
        if (question.questionType === 'free_text') {
          const text = answer?.freeText ?? '';
          if (text.length > 2000) {
            errors[question.id] = '2000文字以内で入力してください。';
            continue;
          }
        }

        // 必須充足チェック
        if (!isRequiredSatisfied(question, answer)) {
          errors[question.id] = 'この設問への回答は必須です。';
        }
      }
    }

    return { errors, hasErrors: Object.keys(errors).length > 0 };
  }

  /**
   * Validate all steps' questions.
   * Returns the index of the first offending step, or -1 if all valid.
   */
  function validateAllSteps(): { allErrors: Record<string, string>; firstOffendingStepIndex: number } {
    const allErrors: Record<string, string> = {};
    let firstOffendingStepIndex = -1;

    for (const step of steps) {
      const { errors, hasErrors } = validateStep(step);
      if (hasErrors) {
        Object.assign(allErrors, errors);
        if (firstOffendingStepIndex === -1) {
          firstOffendingStepIndex = step.stepIndex;
        }
      }
    }

    return { allErrors, firstOffendingStepIndex };
  }

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------

  function handleNext() {
    const currentStep = steps[currentStepIndex];
    if (!currentStep) return;

    const { errors, hasErrors } = validateStep(currentStep);
    if (hasErrors) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      return;
    }

    setCurrentStepIndex((prev) => prev + 1);
    // Clear errors for the step we just left
    setFieldErrors({});
  }

  function handleBack() {
    setCurrentStepIndex((prev) => prev - 1);
    setFieldErrors({});
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');

    // Validate all steps before submitting
    const { allErrors, firstOffendingStepIndex } = validateAllSteps();
    if (firstOffendingStepIndex !== -1) {
      setFieldErrors(allErrors);
      setCurrentStepIndex(firstOffendingStepIndex);
      return;
    }

    const answersPayload = Object.entries(answers).map(([questionId, state]) => ({
      questionId,
      selectedChoiceIds: state.selectedChoiceIds,
      freeText: state.freeText,
    }));

    startTransition(async () => {
      const result = await submitSurvey({
        surveyId: survey.id,
        answers: answersPayload,
      });

      if (result && !result.ok) {
        setFormError(result.error.message ?? 'エラーが発生しました。もう一度お試しください。');
      }
      // 成功時は Server Action 内で redirect('/skill-survey/{surveyId}/result') が呼ばれる
    });
  }

  // ---------------------------------------------------------------------------
  // Guard: empty categories
  // ---------------------------------------------------------------------------

  if (categories.length === 0 || steps.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        このアンケートにはまだ設問がありません。
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const currentStep = steps[currentStepIndex];
  if (!currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* 進捗インジケータ */}
      <SurveyProgress
        steps={steps}
        answers={answers}
        currentStepIndex={currentStepIndex}
      />

      {/* 現在ステップのカテゴリ名見出し */}
      <section aria-labelledby={`step-heading-${currentStepIndex}`}>
        <h2
          id={`step-heading-${currentStepIndex}`}
          className="mb-6 text-xl font-bold text-gray-900"
        >
          {currentStep.categoryName}
        </h2>

        {/* サブカテゴリグループ → 設問 */}
        <div className="space-y-10">
          {currentStep.subgroups.map((subgroup) => (
            <div key={subgroup.subcategory ?? '__root__'}>
              {/* サブカテゴリ見出し（存在する場合） */}
              {subgroup.subcategory && (
                <h3 className="mb-4 border-b border-gray-100 pb-2 text-base font-semibold text-gray-700">
                  {subgroup.subcategory}
                </h3>
              )}

              {/* 設問リスト */}
              <div className="space-y-8">
                {subgroup.questions.map((question, qIndex) => {
                  const answer = answers[question.id];
                  const error = fieldErrors[question.id];

                  return (
                    <div key={question.id} className="space-y-3">
                      {/* 設問テキスト + 必須マーク */}
                      <p className="text-sm font-medium text-gray-800">
                        <span className="mr-1 text-gray-400">{qIndex + 1}.</span>
                        {question.body}
                        {question.isRequired && (
                          <span
                            className="ml-1 text-red-500"
                            aria-label="必須"
                            title="必須"
                          >
                            *
                          </span>
                        )}
                      </p>

                      {/* single_choice → radio group */}
                      {question.questionType === 'single_choice' && (
                        <div className="space-y-2 pl-4">
                          {question.choices.map((choice) => {
                            const inputId = `radio-${question.id}-${choice.id}`;
                            const isChecked =
                              answer?.selectedChoiceIds?.[0] === choice.id;
                            return (
                              <label
                                key={choice.id}
                                htmlFor={inputId}
                                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                              >
                                <input
                                  id={inputId}
                                  type="radio"
                                  name={`q-${question.id}`}
                                  value={choice.id}
                                  checked={isChecked}
                                  onChange={() =>
                                    handleSingleChoice(question.id, choice.id)
                                  }
                                  disabled={isPending}
                                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                {choice.label}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* multi_choice → checkbox group */}
                      {question.questionType === 'multi_choice' && (
                        <div className="space-y-2 pl-4">
                          {question.choices.map((choice) => {
                            const inputId = `checkbox-${question.id}-${choice.id}`;
                            const isChecked =
                              answer?.selectedChoiceIds?.includes(choice.id) ?? false;
                            return (
                              <label
                                key={choice.id}
                                htmlFor={inputId}
                                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                              >
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  name={`q-${question.id}`}
                                  value={choice.id}
                                  checked={isChecked}
                                  onChange={(e) =>
                                    handleMultiChoice(
                                      question.id,
                                      choice.id,
                                      e.target.checked,
                                    )
                                  }
                                  disabled={isPending}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                {choice.label}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* free_text → textarea + 残り文字数 */}
                      {question.questionType === 'free_text' && (
                        <div className="pl-4">
                          <textarea
                            id={`textarea-${question.id}`}
                            name={`q-${question.id}`}
                            value={answer?.freeText ?? ''}
                            onChange={(e) =>
                              handleFreeText(question.id, e.target.value)
                            }
                            disabled={isPending}
                            rows={4}
                            maxLength={2000}
                            placeholder="自由に記入してください（2000文字以内）"
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <p
                            className={`mt-1 text-right text-xs ${
                              (answer?.freeText ?? '').length > 2000
                                ? 'font-semibold text-red-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {(answer?.freeText ?? '').length} / 2000
                          </p>
                        </div>
                      )}

                      {/* インライン検証エラー */}
                      {error && (
                        <p role="alert" className="pl-4 text-sm text-red-600">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* フォームレベルのエラーメッセージ（サーバエラー） */}
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      {/* ナビゲーションボタン */}
      <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-6">
        {/* 戻るボタン（最初のステップでは非表示） */}
        <button
          type="button"
          onClick={handleBack}
          disabled={isFirstStep || isPending}
          className={`rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            isFirstStep ? 'invisible' : ''
          }`}
        >
          戻る
        </button>

        {/* 次へ or 回答を送信する */}
        {isLastStep ? (
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? '送信中...' : '回答を送信する'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            次へ
          </button>
        )}
      </div>
    </form>
  );
}

'use client';

/**
 * スキルアンケート回答フォーム（Client Component）
 *
 * カテゴリ → 設問の順にセクション分割してレンダリングする。
 * - single_choice  → radio group
 * - multi_choice   → checkbox group
 * - free_text      → textarea
 *
 * フォーム送信時に submitSurvey Server Action を呼び出す。
 * バリデーションエラーを各フィールド近辺に表示する。
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import { useState, useTransition } from 'react';

import type {
  SkillSurvey,
  SkillSurveyCategory,
  SkillSurveyQuestion,
  SkillSurveyChoice,
} from '@bulr/db/schema';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db/queries';

import { submitSurvey } from '../[surveyId]/_actions/submit-survey';

// --- Types ---

export type QuestionWithChoices = SkillSurveyQuestion & {
  choices: SkillSurveyChoice[];
};

export type CategoryWithQuestions = SkillSurveyCategory & {
  questions: QuestionWithChoices[];
};

export interface SurveyFormProps {
  survey: SkillSurvey;
  categories: CategoryWithQuestions[];
  existingResponse: SkillSurveyResponseWithAnswers | null;
}

// --- Answer state type ---

interface AnswerState {
  selectedChoiceIds?: string[];
  freeText?: string;
}

// --- Helper: build initial answer state from existingResponse ---

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

// --- Component ---

export function SurveyForm({ survey, categories, existingResponse }: SurveyFormProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    buildInitialAnswers(categories, existingResponse),
  );

  // フィールドレベルのバリデーションエラー { [questionId]: message }
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // フォームレベルのエラーメッセージ
  const [formError, setFormError] = useState('');
  const [isPending, startTransition] = useTransition();

  // --- Handler: single_choice ---

  function handleSingleChoice(questionId: string, choiceId: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { selectedChoiceIds: [choiceId] },
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  // --- Handler: multi_choice ---

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
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  // --- Handler: free_text ---

  function handleFreeText(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { freeText: value },
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  // --- Client-side validation ---

  function validate(): boolean {
    const errors: Record<string, string> = {};

    for (const category of categories) {
      for (const question of category.questions) {
        const answer = answers[question.id];
        if (question.questionType === 'free_text') {
          const text = answer?.freeText ?? '';
          if (text.length > 2000) {
            errors[question.id] = '2000文字以内で入力してください。';
          }
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // --- Submit handler ---

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');

    if (!validate()) {
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

  // --- Render ---

  if (categories.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        このアンケートにはまだ設問がありません。
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-10">
      {categories.map((category) => (
        <section key={category.id} aria-labelledby={`category-${category.id}`}>
          {/* カテゴリ見出し */}
          <h2
            id={`category-${category.id}`}
            className="mb-4 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-800"
          >
            {category.name}
            {category.subcategory && (
              <span className="ml-2 text-base font-normal text-gray-500">
                / {category.subcategory}
              </span>
            )}
          </h2>

          {/* 設問リスト */}
          <div className="space-y-8">
            {category.questions.map((question, qIndex) => (
              <div key={question.id} className="space-y-3">
                {/* 設問テキスト */}
                <p className="text-sm font-medium text-gray-800">
                  <span className="mr-1 text-gray-400">{qIndex + 1}.</span>
                  {question.body}
                </p>

                {/* single_choice → radio group */}
                {question.questionType === 'single_choice' && (
                  <div className="space-y-2 pl-4">
                    {question.choices.map((choice) => {
                      const inputId = `radio-${question.id}-${choice.id}`;
                      const isChecked =
                        answers[question.id]?.selectedChoiceIds?.[0] === choice.id;
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
                            onChange={() => handleSingleChoice(question.id, choice.id)}
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
                        answers[question.id]?.selectedChoiceIds?.includes(choice.id) ?? false;
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
                              handleMultiChoice(question.id, choice.id, e.target.checked)
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

                {/* free_text → textarea */}
                {question.questionType === 'free_text' && (
                  <div className="pl-4">
                    <textarea
                      id={`textarea-${question.id}`}
                      name={`q-${question.id}`}
                      value={answers[question.id]?.freeText ?? ''}
                      onChange={(e) => handleFreeText(question.id, e.target.value)}
                      disabled={isPending}
                      rows={4}
                      maxLength={2000}
                      placeholder="自由に記入してください（2000文字以内）"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <p className="mt-1 text-right text-xs text-gray-400">
                      {(answers[question.id]?.freeText ?? '').length} / 2000
                    </p>
                  </div>
                )}

                {/* フィールドレベルのバリデーションエラー */}
                {fieldErrors[question.id] && (
                  <p role="alert" className="pl-4 text-sm text-red-600">
                    {fieldErrors[question.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* フォームレベルのエラーメッセージ */}
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      {/* 送信ボタン */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? '送信中...' : '回答を送信する'}
      </button>
    </form>
  );
}

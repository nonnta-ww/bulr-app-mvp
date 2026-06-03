'use client';

/**
 * スキルアンケート設問編集フォーム Client Component
 *
 * Props で受け取った設問の body / questionType / displayOrder を編集し、
 * updateQuestion Server Action を呼び出して保存する。
 * adminAction の二重ラップ（result.ok → result.data.ok）を考慮したエラー表示。
 *
 * Requirements: 3.3, 3.5, 6.6
 * Boundary: SkillSurveyQuestionForm (this file only)
 * Depends: 9.1 ✓ (updateQuestion action)
 */

import { useState, useTransition } from 'react';

import { updateQuestion } from '../masters/skill-survey/_actions/update-question';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type SkillSurveyQuestion = {
  id: string;
  body: string;
  questionType: string;
  displayOrder: number;
};

type Props = {
  question: SkillSurveyQuestion;
  surveyId: string;
};

// ---------------------------------------------------------------------------
// questionType の選択肢
// ---------------------------------------------------------------------------

const QUESTION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'single_choice', label: '単一選択' },
  { value: 'multi_choice', label: '複数選択' },
  { value: 'free_text', label: '自由記述' },
];

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SkillSurveyQuestionForm({ question, surveyId: _surveyId }: Props) {
  const [body, setBody] = useState(question.body);
  const [questionType, setQuestionType] = useState(question.questionType);
  const [displayOrder, setDisplayOrder] = useState(String(question.displayOrder));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const orderNum = parseInt(displayOrder, 10);
    if (!body.trim() || isNaN(orderNum) || orderNum < 0) return;

    startTransition(async () => {
      setMessage(null);
      const result = await updateQuestion({
        questionId: question.id,
        body: body.trim(),
        questionType: questionType as 'single_choice' | 'multi_choice' | 'free_text',
        displayOrder: orderNum,
      });

      // adminAction の二重ラップを考慮: result.ok → result.data.ok
      if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      } else if (!result.data.ok) {
        setMessage({ type: 'error', text: `保存失敗: ${String(result.data.error)}` });
      } else {
        setMessage({ type: 'success', text: '保存しました' });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
    >
      {/* 設問本文 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">設問文</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={1000}
          required
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* 設問タイプ + 表示順 */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">回答形式</label>
          <select
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value)}
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {QUESTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">表示順</label>
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            min={0}
            required
            disabled={isPending}
            className="w-20 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !body.trim()}
          className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {isPending ? '保存中…' : '保存'}
        </button>
      </div>

      {/* フィードバックメッセージ */}
      {message && (
        <p
          className={`text-xs font-medium ${
            message.type === 'success' ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

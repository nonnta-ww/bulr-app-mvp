'use client';

/**
 * スキルアンケート選択肢編集フォーム Client Component
 *
 * Props で受け取った選択肢の label / displayOrder を編集し、
 * updateChoice Server Action を呼び出して保存する。
 * adminAction の二重ラップ（result.ok → result.data.ok）を考慮したエラー表示。
 *
 * Requirements: 3.4, 3.5, 6.6
 * Boundary: SkillSurveyChoiceForm (this file only)
 * Depends: 9.2 ✓ (updateChoice action)
 */

import { useState, useTransition } from 'react';

import { updateChoice } from '../masters/skill-survey/_actions/update-choice';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type SkillSurveyChoice = {
  id: string;
  label: string;
  displayOrder: number;
};

type Props = {
  choice: SkillSurveyChoice;
  surveyId: string;
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SkillSurveyChoiceForm({ choice, surveyId: _surveyId }: Props) {
  const [label, setLabel] = useState(choice.label);
  const [displayOrder, setDisplayOrder] = useState(String(choice.displayOrder));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const orderNum = parseInt(displayOrder, 10);
    if (!label.trim() || isNaN(orderNum) || orderNum < 0) return;

    startTransition(async () => {
      setMessage(null);
      const result = await updateChoice({
        choiceId: choice.id,
        label: label.trim(),
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
      className="flex flex-wrap items-end gap-2"
    >
      {/* ラベル */}
      <div className="flex-1 min-w-48">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={500}
          required
          disabled={isPending}
          placeholder="選択肢ラベル"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* 表示順 */}
      <div className="w-20">
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          min={0}
          required
          disabled={isPending}
          aria-label="表示順"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* 保存ボタン */}
      <button
        type="submit"
        disabled={isPending || !label.trim()}
        className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {isPending ? '…' : '保存'}
      </button>

      {/* フィードバックメッセージ */}
      {message && (
        <p
          className={`w-full text-xs font-medium ${
            message.type === 'success' ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

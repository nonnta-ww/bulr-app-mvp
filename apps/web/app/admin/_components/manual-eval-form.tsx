'use client';

/**
 * 手動評価入力フォームコンポーネント
 *
 * LLM 評価値を初期値として表示し、管理者が手動で上書き保存できるフォーム。
 * level_reached / stuck_type はユーザー編集不可（LLM 値をプリセット）。
 * 採用推奨フィールドは含まない（requirements 5.12）。
 *
 * Requirements: 5.1-5.12
 * Boundary: ManualEvalForm (this file only)
 */

import { useState, useTransition } from 'react';

import type { LlmEvaluation, ManualEvaluation } from '@bulr/types/evaluation';

import { updateManualEvaluation } from '../_actions/update-manual-evaluation';
import { manualEvaluationSchema } from '../_lib/manual-evaluation-schema';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  patternCoverageId: string;
  initial?: ManualEvaluation | null;
  llmEvaluation: LlmEvaluation;
};

type FormState = {
  authenticity: number;
  judgment: number;
  scope: number;
  meta_cognition: number;
  ai_literacy: number;
  notes: string;
};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const NOTES_MAX = 5000;

// ---------------------------------------------------------------------------
// ヘルパーコンポーネント
// ---------------------------------------------------------------------------

type NumberFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  error?: string;
  onChange: (value: number) => void;
};

function NumberField({ label, value, min, max, error, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        <span className="ml-1 text-xs text-gray-400">
          ({min}–{max})
        </span>
      </label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed)) {
            onChange(parsed);
          }
        }}
        className="w-24 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function ManualEvalForm({ patternCoverageId, initial, llmEvaluation }: Props) {
  const [form, setForm] = useState<FormState>({
    authenticity: initial?.authenticity ?? llmEvaluation.authenticity,
    judgment: initial?.judgment ?? llmEvaluation.judgment,
    scope: initial?.scope ?? llmEvaluation.scope,
    meta_cognition: initial?.meta_cognition ?? llmEvaluation.meta_cognition,
    ai_literacy: initial?.ai_literacy ?? llmEvaluation.ai_literacy,
    notes: initial?.notes ?? llmEvaluation.notes,
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // level_reached / stuck_type は LLM 値をプリセット（ユーザー編集不可）
  const input = {
    patternCoverageId,
    authenticity: form.authenticity,
    judgment: form.judgment,
    scope: form.scope,
    meta_cognition: form.meta_cognition,
    ai_literacy: form.ai_literacy,
    level_reached: llmEvaluation.level_reached,
    stuck_type: llmEvaluation.stuck_type,
    notes: form.notes,
  };

  const parseResult = manualEvaluationSchema.safeParse(input);
  const isValid = parseResult.success;

  // フィールド別エラーを抽出
  const fieldErrors: Record<string, string> = {};
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
  }

  function handleNumberChange(field: keyof Pick<FormState, 'authenticity' | 'judgment' | 'scope' | 'meta_cognition' | 'ai_literacy'>) {
    return (value: number) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setSuccessMessage(null);
      setErrorMessage(null);
    };
  }

  function handleNotesChange(value: string) {
    setForm((prev) => ({ ...prev, notes: value }));
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid || isPending) return;

    startTransition(async () => {
      const result = await updateManualEvaluation(input);
      // adminAction の 2 段 envelope: outer = wrapper（認証/Zod）、inner = handler（DB）
      if (result.ok && result.data.ok) {
        setSuccessMessage('保存しました');
        setErrorMessage(null);
      } else if (result.ok && !result.data.ok) {
        // handler 内の業務エラー（例: NOT_FOUND）
        setErrorMessage(`保存に失敗しました: ${result.data.error}`);
        setSuccessMessage(null);
      } else if (!result.ok) {
        // wrapper レイヤのエラー（認証 / Zod 検証）
        setErrorMessage(result.error.message);
        setSuccessMessage(null);
      }
    });
  }

  return (
    <section aria-labelledby="manual-eval-form-heading">
      <h2
        id="manual-eval-form-heading"
        className="mb-3 text-base font-semibold text-gray-900"
      >
        手動評価
      </h2>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200 bg-white px-6 py-5 space-y-5"
      >
        {/* スコア入力 */}
        <div className="flex flex-wrap gap-6">
          <NumberField
            label="真贋"
            value={form.authenticity}
            min={0}
            max={3}
            error={fieldErrors['authenticity']}
            onChange={handleNumberChange('authenticity')}
          />
          <NumberField
            label="判断"
            value={form.judgment}
            min={0}
            max={3}
            error={fieldErrors['judgment']}
            onChange={handleNumberChange('judgment')}
          />
          <NumberField
            label="範囲"
            value={form.scope}
            min={1}
            max={5}
            error={fieldErrors['scope']}
            onChange={handleNumberChange('scope')}
          />
          <NumberField
            label="メタ認知"
            value={form.meta_cognition}
            min={0}
            max={3}
            error={fieldErrors['meta_cognition']}
            onChange={handleNumberChange('meta_cognition')}
          />
          <NumberField
            label="AI リテラシー"
            value={form.ai_literacy}
            min={0}
            max={3}
            error={fieldErrors['ai_literacy']}
            onChange={handleNumberChange('ai_literacy')}
          />
        </div>

        {/* メモ */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="manual-eval-notes"
            className="text-sm font-medium text-gray-700"
          >
            メモ
          </label>
          <textarea
            id="manual-eval-notes"
            value={form.notes}
            maxLength={NOTES_MAX}
            rows={5}
            onChange={(e) => handleNotesChange(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
          <p className="self-end text-xs text-gray-400">
            {form.notes.length} / {NOTES_MAX}
          </p>
          {fieldErrors['notes'] && (
            <p className="text-xs text-red-600">{fieldErrors['notes']}</p>
          )}
        </div>

        {/* メッセージ */}
        {successMessage && (
          <p className="text-sm text-green-700 font-medium">{successMessage}</p>
        )}
        {errorMessage && (
          <p className="text-sm text-red-600 font-medium">{errorMessage}</p>
        )}

        {/* 送信ボタン */}
        <div>
          <button
            type="submit"
            disabled={!isValid || isPending}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </section>
  );
}

'use client';

/**
 * CreateSessionForm — 面接セッション作成フォーム（Client Component）
 *
 * - props: { entryId, recommendedPatternCodes, allPatterns }
 * - recommendedPatternCodes で初期チェック状態を設定し、面接官が自由に変更できる
 * - 最低 1 パターン選択のクライアントバリデーション
 * - createSessionFromEntry を呼び出し、useTransition でローディング状態を管理する
 * - 成功時: /interviews/[sessionId] へリダイレクト
 * - エラー時: インラインエラーメッセージを表示
 *
 * Requirements: session-from-entry 3.3, 3.5, 3.6
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { AssessmentPattern } from '@bulr/db/schema';

import { createSessionFromEntry } from '../_actions/create-session-from-entry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  entryId: string;
  recommendedPatternCodes: string[];
  allPatterns: AssessmentPattern[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateSessionForm({ entryId, recommendedPatternCodes, allPatterns }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCodes, setSelectedCodes] = useState<string[]>(recommendedPatternCodes);
  const [error, setError] = useState<string | null>(null);

  function handleToggle(code: string) {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function handleSubmit() {
    // クライアントバリデーション: 最低 1 パターン選択
    if (selectedCodes.length === 0) {
      setError('1 つ以上のパターンを選択してください');
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await createSessionFromEntry({ entryId, selectedPatternCodes: selectedCodes });

      // authedAction レベルのエラー（AuthError / INVALID_INPUT 等）
      if (!result.ok) {
        setError(result.error.message ?? 'セッションの作成に失敗しました。');
        return;
      }

      // handler 業務エラー（authedAction が { ok: true, data } でラップする）
      const inner = result.data;
      if (!inner.ok) {
        setError(inner.error.message ?? 'セッションの作成に失敗しました。');
        return;
      }

      // 成功時: 面接アシスタント画面へリダイレクト
      const { sessionId } = inner.data;
      router.push(`/interviews/${sessionId}`);
    });
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">面接パターンを選択</h2>
      <p className="mb-4 text-sm text-gray-500">
        面接で使用するパターンを選択してください。推奨パターンが初期選択されていますが、自由に変更できます。
      </p>

      {/* パターン一覧チェックボックス */}
      <ul className="mb-4 space-y-2">
        {allPatterns.map((pattern) => {
          const isChecked = selectedCodes.includes(pattern.code);
          return (
            <li key={pattern.code}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  checked={isChecked}
                  onChange={() => handleToggle(pattern.code)}
                  disabled={isPending}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{pattern.title}</span>
                    <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {pattern.category}
                    </span>
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {/* 選択中パターン数 */}
      <p className="mb-4 text-sm text-gray-600">
        選択中: <span className="font-semibold">{selectedCodes.length}</span> パターン
      </p>

      {/* エラーメッセージ */}
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* 送信ボタン */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? '作成中...' : '面接セッションを作成'}
      </button>
    </div>
  );
}

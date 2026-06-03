'use client';

/**
 * 企業作成フォーム Client Component
 *
 * 企業名テキスト入力 + [作成] ボタンを提供する。
 * createCompany action を呼び出し、成功時は action 内の redirect が走るため
 * クライアント側は追加処理不要。エラー時はメッセージを表示する。
 *
 * Requirements: 2.4, 6.1
 * Boundary: CreateCompanyForm (this file only)
 * Depends: 8.1 ✓ (createCompany action)
 */

import { useState, useTransition } from 'react';

import { createCompany } from '../companies/_actions/create-company';

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function CreateCompanyForm() {
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      setErrorMessage(null);
      const result = await createCompany({ name: name.trim() });
      // createCompany の handler は redirect() で終わるため、
      // result が返るのはエラー時のみ（result.ok === false）
      if (!result.ok) {
        setErrorMessage(result.error.message);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-base font-semibold text-gray-900">企業を追加</h2>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="企業名"
          maxLength={200}
          required
          disabled={isPending}
          className="w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {isPending ? '作成中…' : '作成'}
        </button>
      </div>

      {/* エラーメッセージ */}
      {errorMessage && (
        <p className="text-sm font-medium text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}

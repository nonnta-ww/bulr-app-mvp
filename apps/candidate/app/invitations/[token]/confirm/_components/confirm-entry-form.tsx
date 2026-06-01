'use client';

/**
 * ConfirmEntryForm — エントリー確定ボタン（Client Component）
 *
 * createEntry Server Action を呼び出し、エラー結果を表示する。
 * 成功時は Server Action 内の redirect に委ねる。
 *
 * Requirements: entry-flow 4.1
 */

import { useState, useTransition } from 'react';

import { createEntry } from '../_actions/create-entry';

interface ConfirmEntryFormProps {
  token: string;
}

export function ConfirmEntryForm({ token }: ConfirmEntryFormProps) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function messageForCode(code: string, fallback?: string): string {
    if (code === 'DUPLICATE_ENTRY') return '同じ募集に既にエントリー済みです。';
    if (code === 'INVALID_TOKEN') return '招待リンクが無効です。';
    if (code === 'ALREADY_CONSUMED') return 'この招待リンクは既に使用されています。';
    return fallback ?? 'エラーが発生しました。もう一度お試しください。';
  }

  function handleSubmit() {
    setErrorMessage('');
    startTransition(async () => {
      const result = await createEntry({ token });
      if (!result) return;
      // authedAction レベルのエラー（requireCandidate の AuthError / INVALID_INPUT 等）
      if (!result.ok) {
        setErrorMessage(messageForCode(result.error.code, result.error.message));
        return;
      }
      // createEntry ハンドラが返す業務エラー（authedAction が { ok:true, data } でラップする）
      const inner = result.data;
      if (inner && !inner.ok) {
        setErrorMessage(messageForCode(inner.error.code, inner.error.message));
      }
      // 成功時は Server Action 内で redirect('/entries') が呼ばれる（ここには到達しない）
    });
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'エントリー中...' : 'この募集にエントリーする'}
      </button>
    </div>
  );
}

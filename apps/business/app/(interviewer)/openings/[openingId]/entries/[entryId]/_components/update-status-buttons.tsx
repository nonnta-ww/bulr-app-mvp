'use client';

/**
 * UpdateStatusButtons — エントリーステータス更新 Client Component
 *
 * - currentStatus が 'submitted' のときのみ「確認済みにする」「不採用にする」ボタンを表示する。
 * - reviewed / rejected の場合は現在のステータスのみ表示（簡素化 UI）。
 * - 'progressing' への更新は session-from-entry の責務なので含めない。
 * - useTransition + updateEntryStatus Server Action で status を更新する。
 *
 * Requirements: entry-flow 4.2（UpdateStatusButtons 範囲）
 */

import { useState, useTransition } from 'react';

import type { EntryStatus } from '@bulr/db/schema';

import { updateEntryStatus } from '../_actions/update-entry-status';

interface Props {
  entryId: string;
  openingId: string;
  currentStatus: EntryStatus;
}

export function UpdateStatusButtons({ entryId, openingId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpdate(status: 'reviewed' | 'rejected') {
    setError(null);

    startTransition(async () => {
      const result = await updateEntryStatus({ entryId, openingId, status });

      if (!result.ok) {
        setError(result.error.message ?? 'ステータスの更新に失敗しました。');
      }
    });
  }

  // submitted のときのみ操作ボタンを表示
  if (currentStatus !== 'submitted') {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleUpdate('reviewed')}
          className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '更新中...' : '確認済みにする'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleUpdate('rejected')}
          className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '更新中...' : '不採用にする'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

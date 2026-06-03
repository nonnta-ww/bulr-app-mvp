'use client';

/**
 * 候補者詳細ページ アクションボタン Client Component
 *
 * [クォータリセット] / [無効化] ボタンを提供する。
 * useTransition で pending 状態を管理し、実行結果を UI にフィードバックする。
 *
 * Requirements: 1.4, 1.5, 1.6
 * Boundary: CandidateActionButtons (this file only)
 * Depends: 7.1 ✓ (disableCandidate), 7.2 ✓ (resetQuota)
 */

import { useState, useTransition } from 'react';

import { disableCandidate } from '../_actions/disable-candidate';
import { resetQuota } from '../_actions/reset-quota';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  candidateProfileId: string;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function CandidateActionButtons({ candidateProfileId, isActive }: Props) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResetQuota() {
    startTransition(async () => {
      setMessage(null);
      const result = await resetQuota({ candidateProfileId });
      if (result.ok && result.data.ok) {
        setMessage({ type: 'success', text: 'クォータをリセットしました' });
      } else if (result.ok && !result.data.ok) {
        setMessage({ type: 'error', text: `リセット失敗: ${result.data.error}` });
      } else if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      }
    });
  }

  function handleDisable() {
    if (!confirm('この候補者を無効化しますか？この操作は取り消せません。')) return;
    startTransition(async () => {
      setMessage(null);
      const result = await disableCandidate({ candidateProfileId });
      if (result.ok && result.data.ok) {
        setMessage({ type: 'success', text: '無効化しました' });
      } else if (result.ok && !result.data.ok) {
        setMessage({ type: 'error', text: `無効化失敗: ${result.data.error}` });
      } else if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {/* クォータリセット */}
        <button
          type="button"
          onClick={handleResetQuota}
          disabled={isPending}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {isPending ? '処理中…' : 'クォータリセット'}
        </button>

        {/* 無効化（有効な候補者のみ表示） */}
        {isActive && (
          <button
            type="button"
            onClick={handleDisable}
            disabled={isPending}
            className="inline-flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isPending ? '処理中…' : '無効化'}
          </button>
        )}
      </div>

      {/* フィードバックメッセージ */}
      {message && (
        <p
          className={`text-sm font-medium ${
            message.type === 'success' ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

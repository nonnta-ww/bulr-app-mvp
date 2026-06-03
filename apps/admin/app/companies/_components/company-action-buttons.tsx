'use client';

/**
 * 企業詳細ページ アクションボタン Client Component
 *
 * [無効化] ボタンを提供する。
 * useTransition で pending 状態を管理し、実行結果を UI にフィードバックする。
 *
 * Requirements: 2.3, 6.1
 * Boundary: CompanyActionButtons (this file only)
 * Depends: 8.2 ✓ (disableCompany action)
 */

import { useState, useTransition } from 'react';

import { disableCompany } from '../_actions/disable-company';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  companyId: string;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function CompanyActionButtons({ companyId, isActive }: Props) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisable() {
    if (!confirm('この企業を無効化しますか？この操作は取り消せません。')) return;
    startTransition(async () => {
      setMessage(null);
      const result = await disableCompany({ companyId });
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
        {/* 無効化（有効な企業のみ表示） */}
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

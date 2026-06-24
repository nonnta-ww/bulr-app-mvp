'use client';

/**
 * メンバー解除ボタン Client Component
 *
 * 面接官（メンバー）を会社から解除する「解除」ボタンを提供する。
 * 解除前に confirm() で確認を求める。
 * useTransition で pending 状態を管理し、実行結果を UI にフィードバックする。
 *
 * Requirements: 3.2
 * Boundary: MemberRemoveButton (this file only)
 * Depends: removeCompanyMember action
 */

import { useState, useTransition } from 'react';

import { removeCompanyMember } from '../_actions/remove-company-member';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  companyId: string;
  userId: string;
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function MemberRemoveButton({ companyId, userId }: Props) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    if (!confirm('このメンバーを解除しますか？')) return;

    startTransition(async () => {
      setMessage(null);
      const result = await removeCompanyMember({ companyId, userId });

      if (result.ok && result.data.ok) {
        setMessage({ type: 'success', text: '解除済み' });
      } else if (result.ok && !result.data.ok) {
        setMessage({
          type: 'error',
          text: `解除失敗: ${(result.data as { ok: false; error: { message: string } }).error.message}`,
        });
      } else if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      }
    });
  }

  if (message?.type === 'success') {
    return <span className="text-sm text-gray-400">解除済み</span>;
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="inline-flex items-center rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {isPending ? '処理中…' : '解除'}
      </button>
      {message?.type === 'error' && (
        <span className="text-xs text-red-600">{message.text}</span>
      )}
    </div>
  );
}

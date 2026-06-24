'use client';

/**
 * 会社ステータス操作ボタン Client Component
 *
 * 現在のステータスに応じた有効な遷移ボタンのみを表示する。
 * 解約（terminated）への遷移は confirm() で確認を求める。
 * useTransition で pending 状態を管理し、実行結果を UI にフィードバックする。
 *
 * Requirements: 4.2, 4.3, 4.4
 * Boundary: CompanyStatusControls (this file only)
 * Depends: setCompanyStatus action, isAllowedCompanyTransition helper
 */

import { useState, useTransition } from 'react';

import { setCompanyStatus } from '../_actions/set-company-status';
import { isAllowedCompanyTransition } from '../_actions/company-status-transitions';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type CompanyStatus = 'active' | 'suspended' | 'terminated';

type Props = {
  companyId: string;
  status: CompanyStatus;
};

// ---------------------------------------------------------------------------
// ステータスボタン定義
// ---------------------------------------------------------------------------

type TransitionButton = {
  target: CompanyStatus;
  label: string;
  confirmMessage?: string;
  className: string;
};

const ALL_TRANSITIONS: TransitionButton[] = [
  {
    target: 'suspended',
    label: '一時停止',
    confirmMessage: 'この会社を一時停止しますか？',
    className:
      'inline-flex items-center rounded-md border border-yellow-300 bg-white px-4 py-2 text-sm font-medium text-yellow-700 shadow-sm hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
  },
  {
    target: 'active',
    label: '再有効化',
    confirmMessage: 'この会社を再有効化しますか？',
    className:
      'inline-flex items-center rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 shadow-sm hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
  },
  {
    target: 'terminated',
    label: '解約',
    confirmMessage:
      'この会社を解約しますか？この操作は取り消せません。解約後は再有効化できなくなります。',
    className:
      'inline-flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
  },
];

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function CompanyStatusControls({ companyId, status }: Props) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleButtons = ALL_TRANSITIONS.filter((btn) =>
    isAllowedCompanyTransition(status, btn.target),
  );

  function handleTransition(btn: TransitionButton) {
    if (btn.confirmMessage && !confirm(btn.confirmMessage)) return;

    startTransition(async () => {
      setMessage(null);
      const result = await setCompanyStatus({ companyId, status: btn.target });

      if (result.ok && result.data.ok) {
        const labelMap: Record<CompanyStatus, string> = {
          active: '再有効化しました',
          suspended: '一時停止しました',
          terminated: '解約しました',
        };
        setMessage({ type: 'success', text: labelMap[btn.target] });
      } else if (result.ok && !result.data.ok) {
        setMessage({
          type: 'error',
          text: `操作失敗: ${(result.data as { ok: false; error: { message: string } }).error.message}`,
        });
      } else if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      }
    });
  }

  if (visibleButtons.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        このステータスからの遷移操作はありません（終端状態）
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {visibleButtons.map((btn) => (
          <button
            key={btn.target}
            type="button"
            onClick={() => handleTransition(btn)}
            disabled={isPending}
            className={btn.className}
          >
            {isPending ? '処理中…' : btn.label}
          </button>
        ))}
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

'use client';

/**
 * 企業ユーザー招待フォーム Client Component
 *
 * メールアドレスと役割を入力して企業ユーザーを招待するフォームを提供する。
 * useTransition で pending 状態を管理し、実行結果を UI にフィードバックする。
 *
 * Requirements: 1.1, 3.1
 * Boundary: InviteMemberForm (this file only)
 * Depends: createCompanyInvitation action
 */

import { useState, useTransition } from 'react';

import { createCompanyInvitation } from '../_actions/create-company-invitation';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Props = {
  companyId: string;
};

type Role = 'admin' | 'member';

// ---------------------------------------------------------------------------
// エラーコードマッピング
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: '会社が見つかりません',
  COMPANY_INACTIVE: '一時停止または解約中の会社には招待できません',
  ALREADY_MEMBER: '指定ユーザーは既にいずれかの会社に所属しています',
  ALREADY_INVITED: 'この会社・メール宛の保留中の招待が既に存在します',
  CONFIGURATION_ERROR: 'システム設定エラーが発生しました。管理者に連絡してください',
};

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function InviteMemberForm({ companyId }: Props) {
  const [email, setEmail] = useState('');
  const [roleInOrg, setRoleInOrg] = useState<Role>('member');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    startTransition(async () => {
      setMessage(null);
      const result = await createCompanyInvitation({ companyId, email: trimmedEmail, roleInOrg });

      if (result.ok && result.data.ok) {
        setMessage({ type: 'success', text: '招待を送信しました' });
        setEmail('');
        setRoleInOrg('member');
      } else if (result.ok && !result.data.ok) {
        const errorCode = (result.data as { ok: false; error: { code: string; message: string } }).error.code;
        const mapped = ERROR_MESSAGES[errorCode];
        setMessage({
          type: 'error',
          text: mapped ?? `招待失敗: ${(result.data as { ok: false; error: { code: string; message: string } }).error.message}`,
        });
      } else if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* メールアドレス入力 */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="invite-email"
            className="text-sm font-medium text-gray-700"
          >
            メールアドレス
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={isPending}
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* 役割選択 */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="invite-role"
            className="text-sm font-medium text-gray-700"
          >
            役割
          </label>
          <select
            id="invite-role"
            value={roleInOrg}
            onChange={(e) => setRoleInOrg(e.target.value as Role)}
            disabled={isPending}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="member">メンバー</option>
            <option value="admin">管理者</option>
          </select>
        </div>

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {isPending ? '送信中…' : '招待する'}
        </button>
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
    </form>
  );
}

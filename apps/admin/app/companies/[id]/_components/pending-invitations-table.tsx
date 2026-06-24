'use client';

/**
 * 保留中招待一覧テーブル Client Component
 *
 * 保留中（pending）の招待を一覧表示し、各行に「取消」ボタンを提供する。
 * 取消操作は revokeCompanyInvitation アクションを呼び出す。
 * useTransition で pending 状態を管理し、実行結果を UI にフィードバックする。
 *
 * Requirements: 3.1, 3.3
 * Boundary: PendingInvitationsTable (this file only)
 * Depends: revokeCompanyInvitation action
 */

import { useState, useTransition } from 'react';

import { revokeCompanyInvitation } from '../_actions/revoke-company-invitation';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Invitation = {
  id: string;
  email: string;
  roleInOrg: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

type Props = {
  invitations: Invitation[];
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** Date を「YYYY-MM-DD」形式（JST）に整形する。 */
function formatDate(date: Date): string {
  const d = date instanceof Date ? date : new Date(date as unknown as string);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
    .format(d)
    .replace(/\//g, '-');
}

/** 役割の日本語ラベルを返す。 */
function roleLabel(roleInOrg: string): string {
  if (roleInOrg === 'admin') return '管理者';
  if (roleInOrg === 'member') return 'メンバー';
  return roleInOrg;
}

// ---------------------------------------------------------------------------
// 取消ボタン（行ごとに独立した pending 状態を持つ）
// ---------------------------------------------------------------------------

function RevokeButton({ invitationId }: { invitationId: string }) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    startTransition(async () => {
      setMessage(null);
      const result = await revokeCompanyInvitation({ invitationId });

      if (result.ok && result.data.ok) {
        setMessage({ type: 'success', text: '取消済み' });
      } else if (result.ok && !result.data.ok) {
        setMessage({
          type: 'error',
          text: `取消失敗: ${(result.data as { ok: false; error: { message: string } }).error.message}`,
        });
      } else if (!result.ok) {
        setMessage({ type: 'error', text: result.error.message });
      }
    });
  }

  if (message?.type === 'success') {
    return <span className="text-sm text-gray-400">取消済み</span>;
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <button
        type="button"
        onClick={handleRevoke}
        disabled={isPending}
        className="inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {isPending ? '処理中…' : '取消'}
      </button>
      {message?.type === 'error' && (
        <span className="text-xs text-red-600">{message.text}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function PendingInvitationsTable({ invitations }: Props) {
  if (invitations.length === 0) {
    return <p className="text-sm text-gray-500">保留中の招待はありません</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">メールアドレス</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">役割</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">有効期限</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">招待日時</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {invitations.map((inv) => (
            <tr key={inv.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{inv.email}</td>
              <td className="px-4 py-3 text-gray-700">{roleLabel(inv.roleInOrg)}</td>
              <td className="px-4 py-3 text-gray-700">{formatDate(inv.expiresAt)}</td>
              <td className="px-4 py-3 text-gray-700">{formatDate(inv.createdAt)}</td>
              <td className="px-4 py-3">
                <RevokeButton invitationId={inv.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

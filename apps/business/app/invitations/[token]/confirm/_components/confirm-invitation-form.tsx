'use client';

/**
 * ConfirmInvitationForm — 会社招待受諾ボタン（Client Component）
 *
 * acceptCompanyInvitation Server Action を呼び出し、エラー結果を表示する。
 * 成功時は Server Action 内の redirect に委ねる（/openings へ）。
 *
 * Requirements: company-user-invitation 2.1, 2.3, 2.5, 2.6
 */

import { useState, useTransition } from 'react';

import { acceptCompanyInvitation } from '../_actions/accept-company-invitation';

interface ConfirmInvitationFormProps {
  token: string;
}

/**
 * ドメインエラーコードを日本語メッセージに変換する純粋関数。
 * テスト可能なように export する。
 */
export function messageForCode(code: string, fallback?: string): string {
  if (code === 'INVALID_TOKEN') return '招待リンクが無効です。';
  if (code === 'REVOKED') return 'この招待は取り消されています。';
  if (code === 'ALREADY_CONSUMED') return 'この招待は既に使用されています。';
  if (code === 'EXPIRED') return 'この招待リンクは有効期限が切れています。';
  if (code === 'COMPANY_INACTIVE') return '会社が利用停止中のため受諾できません。';
  if (code === 'EMAIL_MISMATCH') return '招待先のメールアドレスと一致しません。';
  if (code === 'ALREADY_MEMBER') return '既にいずれかの会社に所属しています。';
  return fallback ?? 'エラーが発生しました。もう一度お試しください。';
}

export function ConfirmInvitationForm({ token }: ConfirmInvitationFormProps) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setErrorMessage('');
    startTransition(async () => {
      const result = await acceptCompanyInvitation({ token });
      if (!result) return;
      // authedAction レベルのエラー（requireUser の AuthError / INVALID_INPUT 等）
      if (!result.ok) {
        setErrorMessage(messageForCode(result.error.code, result.error.message));
        return;
      }
      // acceptCompanyInvitation ハンドラが返す業務エラー（authedAction が { ok:true, data } でラップする）
      const inner = result.data;
      if (inner && !inner.ok) {
        setErrorMessage(messageForCode(inner.error.code, inner.error.message));
      }
      // 成功時は Server Action 内で redirect('/openings') が呼ばれる（ここには到達しない）
    });
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-soft disabled:opacity-50"
      >
        {isPending ? '参加処理中...' : 'この会社に参加する'}
      </button>
    </div>
  );
}

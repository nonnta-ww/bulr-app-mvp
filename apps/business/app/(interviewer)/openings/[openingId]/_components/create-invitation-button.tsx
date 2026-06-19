'use client';

/**
 * CreateInvitationButton — 招待リンク発行ボタン（Client Component）
 *
 * クリックすると createInvitation Server Action を呼び出し、
 * 発行された招待 URL を表示する。
 *
 * Requirements: company-and-opening 6.x, 8.x
 */

import { useState, useTransition } from 'react';

import { Icon } from '@/components/ui/icon';
import { createInvitation } from '../_actions/create-invitation';

interface CreateInvitationButtonProps {
  openingId: string;
}

export function CreateInvitationButton({ openingId }: CreateInvitationButtonProps) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setErrorMessage('');
    startTransition(async () => {
      const result = await createInvitation({ openingId });
      if (result && !result.ok) {
        setErrorMessage(result.error.message ?? 'エラーが発生しました。もう一度お試しください。');
      }
      // 成功時は revalidatePath によりページが再レンダリングされる
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-card px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
      >
        <Icon name="add_link" size={18} />
        {isPending ? '発行中...' : '新規招待リンク作成'}
      </button>
      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}

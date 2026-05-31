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
import { Button } from '@bulr/ui';
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
      <Button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="bg-blue-600 text-white hover:bg-blue-700"
      >
        {isPending ? '発行中...' : '招待リンクを発行'}
      </Button>
      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}

'use client';

/**
 * ResumePreviewButton — 履歴書プレビュー Client Component
 *
 * - クリック時に getResumeSignedUrlForBusiness を呼んで署名 URL を取得し、
 *   window.open で新タブを開く。
 * - useTransition でローディング状態を管理する。
 * - エラー時はインラインメッセージを表示する。
 *
 * Requirements: entry-flow 8.x（履歴書確認ボタン）
 */

import { useState, useTransition } from 'react';

import { getResumeSignedUrlForBusiness } from '../_actions/get-resume-signed-url';

interface Props {
  entryId: string;
  openingId: string;
}

export function ResumePreviewButton({ entryId, openingId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    startTransition(async () => {
      const result = await getResumeSignedUrlForBusiness({ entryId, openingId });

      // authedAction の外側 Result チェック
      if (!result.ok) {
        setError(result.error.message ?? '署名 URL の取得に失敗しました。');
        return;
      }

      // authedAction の内側 Result チェック (handler が ok: false を返す場合)
      const inner = result.data;
      if (!inner.ok) {
        if (inner.error.code === 'RESUME_NOT_AVAILABLE') {
          setError('履歴書が削除されたか未登録です。');
        } else {
          setError(inner.error.message ?? '署名 URL の取得に失敗しました。');
        }
        return;
      }

      window.open(inner.data.signedUrl, '_blank', 'noopener');
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? '取得中...' : '履歴書を表示'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

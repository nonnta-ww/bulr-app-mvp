'use client';

/**
 * ResumeList — 履歴書一覧 Client Component
 *
 * - ドキュメントごとに original_filename, kind, is_primary（「メイン」バッジ）、
 *   uploaded_at（日本時間・日付）を表示する
 * - 「メインにする」ボタンクリックで setPrimaryResumeAction を呼び UI を更新する
 * - 「プレビュー」ボタンクリックで getSignedUrlAction を呼び window.open する
 * - 「削除」ボタンクリックで確認ダイアログを表示し、確認後に deleteResumeAction を呼ぶ
 * - ドキュメントが 0 件の場合は空状態メッセージとアップロードページへのリンクを表示する
 *
 * Requirements: 4.1, 4.2, 4.3, 5.1, 6.1, 7.4, 7.5
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { ResumeDocument } from '@bulr/db/schema';

import { deleteResumeAction } from '../_actions/delete-resume';
import { getSignedUrlAction } from '../_actions/get-signed-url';
import { setPrimaryResumeAction } from '../_actions/set-primary-resume';

// ---------------------------------------------------------------------------
// 型・定数
// ---------------------------------------------------------------------------

interface Props {
  documents: ResumeDocument[];
}

const DATE_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function formatDate(value: Date | string): string {
  return DATE_FORMAT.format(new Date(value));
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function ResumeList({ documents }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 操作中のドキュメント ID と種別を管理してボタン単体の pending を表現する
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  function setError(id: string, message: string) {
    setErrorMap((prev) => ({ ...prev, [id]: message }));
  }

  function clearError(id: string) {
    setErrorMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // --- メインにする ---
  function handleSetPrimary(documentId: string) {
    clearError(documentId);
    setPendingId(documentId);

    const formData = new FormData();
    formData.append('documentId', documentId);

    startTransition(async () => {
      const result = await setPrimaryResumeAction(formData);
      setPendingId(null);

      if (!result.ok) {
        setError(documentId, result.error.message ?? 'メインへの変更に失敗しました。');
        return;
      }

      router.refresh();
    });
  }

  // --- プレビュー ---
  function handlePreview(documentId: string) {
    clearError(documentId);
    setPendingId(documentId);

    const formData = new FormData();
    formData.append('documentId', documentId);

    startTransition(async () => {
      const result = await getSignedUrlAction(formData);
      setPendingId(null);

      if (!result.ok) {
        setError(documentId, result.error.message ?? 'プレビューの表示に失敗しました。');
        return;
      }

      window.open(result.data.downloadUrl, '_blank', 'noopener');
    });
  }

  // --- 削除 ---
  function handleDelete(documentId: string, filename: string) {
    const confirmed = window.confirm(
      `「${filename}」を削除しますか？\nこの操作は取り消せません。`,
    );
    if (!confirmed) return;

    clearError(documentId);
    setPendingId(documentId);

    const formData = new FormData();
    formData.append('documentId', documentId);

    startTransition(async () => {
      const result = await deleteResumeAction(formData);
      setPendingId(null);

      if (!result.ok) {
        setError(documentId, result.error.message ?? '削除に失敗しました。');
        return;
      }

      router.refresh();
    });
  }

  // ---------------------------------------------------------------------------
  // 空状態
  // ---------------------------------------------------------------------------

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-hairline bg-card px-6 py-12 text-center">
        <span className="material-symbols-outlined text-[32px] text-slate opacity-60" aria-hidden="true">
          description
        </span>
        <p className="text-sm text-muted">履歴書がまだアップロードされていません</p>
        <Link
          href="/resume/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            add
          </span>
          履歴書をアップロードする
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 一覧
  // ---------------------------------------------------------------------------

  const actionBtn =
    'inline-flex items-center gap-1 rounded-lg border border-hairline px-3 py-1.5 text-sm text-slate transition-colors hover:border-slate hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';
  const deleteBtn =
    'inline-flex items-center gap-1 rounded-lg border border-[#f5c6c2] px-3 py-1.5 text-sm text-ember transition-colors hover:bg-[#ffdad6] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-card shadow-ambient">
      {/* ヘッダ行（デスクトップのみ） */}
      <div className="hidden items-center gap-4 border-b border-hairline px-5 py-3 text-xs font-medium text-muted md:flex">
        <span className="flex-1">ファイル名</span>
        <span className="w-32">アップロード日</span>
        <span className="w-[220px] text-right">アクション</span>
      </div>

      {documents.map((doc, index) => {
        const isThisPending = isPending && pendingId === doc.id;
        const errorMessage = errorMap[doc.id];

        return (
          <div
            key={doc.id}
            className={`px-5 py-4 ${index > 0 ? 'border-t border-hairline' : ''}`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              {/* ファイル名 + 種別 + メイン */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="material-symbols-outlined shrink-0 text-slate" aria-hidden="true">
                  description
                </span>
                <span className="truncate text-sm font-medium text-ink">
                  {doc.originalFilename}
                </span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                  {doc.kind}
                </span>
                {doc.isPrimary && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-[#8f4d00]">
                    メイン
                  </span>
                )}
              </div>

              {/* アップロード日 */}
              <span className="text-sm text-muted md:w-32">{formatDate(doc.uploadedAt)}</span>

              {/* アクション */}
              <div className="flex flex-wrap gap-2 md:w-[220px] md:justify-end">
                {!doc.isPrimary && (
                  <button
                    type="button"
                    disabled={isThisPending}
                    onClick={() => handleSetPrimary(doc.id)}
                    className={actionBtn}
                  >
                    {isThisPending ? '処理中...' : 'メインにする'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isThisPending}
                  onClick={() => handlePreview(doc.id)}
                  className={actionBtn}
                >
                  {isThisPending ? '処理中...' : 'プレビュー'}
                </button>
                <button
                  type="button"
                  disabled={isThisPending}
                  onClick={() => handleDelete(doc.id, doc.originalFilename)}
                  className={deleteBtn}
                >
                  {isThisPending ? '処理中...' : '削除'}
                </button>
              </div>
            </div>

            {/* エラーメッセージ */}
            {errorMessage && (
              <p role="alert" className="mt-2 rounded-lg bg-[#ffdad6] px-3 py-1.5 text-xs text-[#93000a]">
                {errorMessage}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

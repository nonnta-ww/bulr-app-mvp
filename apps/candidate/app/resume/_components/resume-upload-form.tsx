'use client';

/**
 * ResumeUploadForm — 履歴書アップロードフォーム（Client Component）
 *
 * - 種別（履歴書 / 職務経歴書 / CV / レジュメ）を <select> で選択する
 * - <input type="file" accept=".pdf,.doc,.docx,.txt"> でファイルを選択する
 * - クライアント側で 10MB 超のファイルを検出してエラーメッセージを表示する
 * - uploadResumeAction(formData) を呼び出し、成功後に /resume へリダイレクトする
 * - 送信中はボタンを disabled にして二重送信を防ぐ
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.7
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@bulr/ui';

import { uploadResumeAction } from '../_actions/upload-resume';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const RESUME_KINDS = ['履歴書', '職務経歴書', 'CV', 'レジュメ'] as const;
type ResumeKind = (typeof RESUME_KINDS)[number];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function ResumeUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<ResumeKind>('履歴書');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');

    const file = fileInputRef.current?.files?.[0];

    // ファイル未選択チェック
    if (!file) {
      setErrorMessage('ファイルを選択してください。');
      return;
    }

    // クライアント側 10MB サイズチェック（Req 3.3）
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage('ファイルサイズは 10MB 以下にしてください。');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);

    startTransition(async () => {
      const result = await uploadResumeAction(formData);

      if (!result.ok) {
        setErrorMessage(result.error.message ?? 'アップロードに失敗しました。再試行してください。');
        return;
      }

      // 成功時: 一覧ページへリダイレクト（Req 3.1）
      router.push('/resume');
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* 種別選択（Req 3.7） */}
      <div className="space-y-2">
        <label htmlFor="resume-kind" className="block text-sm font-medium text-gray-700">
          書類の種別
        </label>
        <select
          id="resume-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ResumeKind)}
          disabled={isPending}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {RESUME_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {/* ファイル選択（Req 3.2） */}
      <div className="space-y-2">
        <label htmlFor="resume-file" className="block text-sm font-medium text-gray-700">
          ファイルを選択
          <span className="ml-1 text-xs text-gray-500">（PDF・Word・テキスト、最大 10MB）</span>
        </label>
        <input
          ref={fileInputRef}
          id="resume-file"
          type="file"
          name="file"
          accept=".pdf,.doc,.docx,.txt"
          disabled={isPending}
          className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* エラーメッセージ（Req 3.3, 3.4） */}
      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {/* 送信ボタン — 送信中は disabled で二重送信を防ぐ */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-blue-600 text-white hover:bg-blue-700"
      >
        {isPending ? 'アップロード中...' : 'アップロードする'}
      </Button>
    </form>
  );
}

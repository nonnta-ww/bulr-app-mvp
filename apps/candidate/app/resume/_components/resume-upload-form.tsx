'use client';

/**
 * ResumeUploadForm — 履歴書アップロードフォーム（Client Component）
 *
 * - 種別（履歴書 / 職務経歴書 / CV / レジュメ）を <select> で選択する
 * - <input type="file" accept=".pdf,.doc,.docx,.txt"> でファイルを選択する
 * - クライアント側で未選択・MIME 不一致・4MB 超を検出してエラーメッセージを表示する
 * - fetch('/api/resume/upload') へ FormData を POST する（サーバ経由アップロード）
 *   - Server Action の 1MB ボディ上限を避けるため Route Handler を使う
 *   - 応答は常に JSON。失敗時はエラー画面に落とさず inline メッセージで表示する
 * - 成功後に /resume へリダイレクトする
 * - 送信中はボタンを disabled にして二重送信を防ぐ
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.7
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@bulr/ui';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const RESUME_KINDS = ['履歴書', '職務経歴書', 'CV', 'レジュメ'] as const;
type ResumeKind = (typeof RESUME_KINDS)[number];

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function ResumeUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<ResumeKind>('履歴書');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');

    const file = fileInputRef.current?.files?.[0];

    // ファイル未選択チェック
    if (!file) {
      setErrorMessage('ファイルを選択してください。');
      return;
    }

    // クライアント側 MIME チェック（Req 3.4）
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrorMessage(
        'サポートされていないファイル形式です。PDF・Word（doc/docx）・テキストファイルをアップロードしてください。',
      );
      return;
    }

    // クライアント側 4MB サイズチェック（Req 3.3）
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage('ファイルサイズは 4MB 以下にしてください。');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/resume/upload', { method: 'POST', body: formData });

      // 応答は JSON 想定。万一 JSON でなくても例外を握ってメッセージ化する
      const result = (await res.json().catch(() => null)) as
        | { ok: true; id: string }
        | { ok: false; error: { code: string; message: string } }
        | null;

      if (!res.ok || !result || !result.ok) {
        setErrorMessage(
          (result && !result.ok && result.error.message) ||
            'アップロードに失敗しました。再試行してください。',
        );
        return;
      }

      // 成功時: 一覧ページへリダイレクト（Req 3.1）
      router.push('/resume');
    } catch {
      // ネットワークエラー等もエラー画面に落とさず inline で通知する
      setErrorMessage('アップロードに失敗しました。通信状況を確認して再試行してください。');
    } finally {
      setIsSubmitting(false);
    }
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
          disabled={isSubmitting}
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
          <span className="ml-1 text-xs text-gray-500">（PDF・Word・テキスト、最大 4MB）</span>
        </label>
        <input
          ref={fileInputRef}
          id="resume-file"
          type="file"
          name="file"
          accept=".pdf,.doc,.docx,.txt"
          disabled={isSubmitting}
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
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white hover:bg-blue-700"
      >
        {isSubmitting ? 'アップロード中...' : 'アップロードする'}
      </Button>
    </form>
  );
}

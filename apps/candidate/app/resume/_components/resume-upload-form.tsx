'use client';

/**
 * ResumeUploadForm — 履歴書アップロードフォーム（Client Component）
 *
 * - 種別（履歴書 / 職務経歴書 / CV / レジュメ）をピルボタンで選択する
 * - ドロップゾーン（ドラッグ&ドロップ or クリックでファイル選択）でファイルを選ぶ
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setErrorMessage('');
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');

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
      {/* ドロップゾーン（Req 3.2） */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        aria-label="ファイルをドラッグ、またはクリックして選択"
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed px-6 py-14 text-center transition-colors',
          dragActive ? 'border-slate bg-surface-2' : 'border-hairline hover:border-slate',
        ].join(' ')}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-slate">
          <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
            cloud_upload
          </span>
        </span>
        {file ? (
          <div>
            <p className="text-lg font-medium text-ink">{file.name}</p>
            <p className="mt-1 text-xs text-slate">クリックで別のファイルを選択</p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium text-ink">
              ファイルをドラッグ、またはクリックして選択
            </p>
            <p className="mt-1 text-xs text-slate">PDF / Word / テキスト・最大 4MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          id="resume-file"
          type="file"
          name="file"
          accept=".pdf,.doc,.docx,.txt"
          disabled={isSubmitting}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrorMessage('');
          }}
          className="hidden"
        />
      </div>

      {/* 種別選択（Req 3.7）— ピルボタン */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">書類の種類</p>
        <div className="flex flex-wrap gap-2">
          {RESUME_KINDS.map((k) => {
            const selected = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                disabled={isSubmitting}
                aria-pressed={selected}
                className={[
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  selected
                    ? 'border-primary bg-primary/15 text-[#8f4d00]'
                    : 'border-transparent bg-surface-2 text-muted hover:text-ink',
                ].join(' ')}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      {/* エラーメッセージ（Req 3.3, 3.4） */}
      {errorMessage && (
        <p role="alert" className="rounded-lg bg-[#ffdad6] px-3 py-2 text-sm text-[#93000a]">
          {errorMessage}
        </p>
      )}

      {/* アクション */}
      <div className="flex justify-end gap-3 border-t border-hairline pt-6">
        <Link
          href="/resume"
          className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-slate transition-colors hover:bg-surface-2"
        >
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'アップロード中...' : 'アップロード'}
        </button>
      </div>
    </form>
  );
}

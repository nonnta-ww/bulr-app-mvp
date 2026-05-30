'use client';

/**
 * CandidateForm Client Component
 *
 * 候補者情報を入力するフォームコンポーネント。
 * createSession Server Action を呼び出し、バリデーションエラーをフィールドレベルで表示する。
 *
 * Requirements: 3.1, 3.2, 3.3
 */

import { useState, useTransition } from 'react';

import { createSession } from '@/lib/actions/create-session';

// ---------------------------------------------------------------------------
// フォームフィールドエラー型
// ---------------------------------------------------------------------------

type FieldErrors = {
  name?: string;
  applied_role?: string;
  background_summary?: string;
  email?: string;
  _global?: string;
};

// ---------------------------------------------------------------------------
// CandidateForm Component
// ---------------------------------------------------------------------------

export function CandidateForm() {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const rawInput = {
      name: formData.get('name') as string,
      applied_role: formData.get('applied_role') as string,
      background_summary: formData.get('background_summary') as string,
      email: (formData.get('email') as string) || undefined,
    };

    // クライアント側の必須チェック（UX 向上のため）
    const errors: FieldErrors = {};
    if (!rawInput.name) errors.name = '氏名は必須です';
    if (!rawInput.applied_role) errors.applied_role = '応募職種は必須です';
    if (!rawInput.background_summary) errors.background_summary = '経歴サマリーは必須です';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      const result = await createSession(rawInput);

      // ok: true の場合は redirect が発火するためここには到達しない
      if (!result.ok) {
        const { code, message } = result.error;
        if (code === 'INVALID_INPUT') {
          // サーバー側 Zod エラー: メッセージをグローバルエラーとして表示
          setFieldErrors({ _global: message });
        } else if (code === 'RATE_LIMIT_EXCEEDED') {
          setFieldErrors({ _global: '1日のセッション作成上限に達しました。明日またお試しください。' });
        } else if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
          setFieldErrors({ _global: 'セッションが切れました。再度ログインしてください。' });
        } else {
          setFieldErrors({ _global: message || '予期しないエラーが発生しました。' });
        }
      }
    });
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';
  const errorClass = 'mt-1 text-xs text-red-600';

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* グローバルエラー */}
      {fieldErrors._global && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {fieldErrors._global}
        </div>
      )}

      {/* 氏名 */}
      <div>
        <label htmlFor="name" className={labelClass}>
          氏名 <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          disabled={isPending}
          className={inputClass}
          placeholder="山田 太郎"
        />
        {fieldErrors.name && <p className={errorClass}>{fieldErrors.name}</p>}
      </div>

      {/* 応募職種 */}
      <div>
        <label htmlFor="applied_role" className={labelClass}>
          応募職種 <span className="text-red-500">*</span>
        </label>
        <input
          id="applied_role"
          name="applied_role"
          type="text"
          required
          disabled={isPending}
          className={inputClass}
          placeholder="バックエンドエンジニア"
        />
        {fieldErrors.applied_role && <p className={errorClass}>{fieldErrors.applied_role}</p>}
      </div>

      {/* 経歴サマリー */}
      <div>
        <label htmlFor="background_summary" className={labelClass}>
          経歴サマリー <span className="text-red-500">*</span>
        </label>
        <textarea
          id="background_summary"
          name="background_summary"
          required
          disabled={isPending}
          rows={5}
          className={inputClass}
          placeholder="これまでの経験・スキルを簡潔にまとめてください（5000文字以内）"
        />
        {fieldErrors.background_summary && (
          <p className={errorClass}>{fieldErrors.background_summary}</p>
        )}
      </div>

      {/* メールアドレス（任意） */}
      <div>
        <label htmlFor="email" className={labelClass}>
          メールアドレス <span className="text-gray-400 text-xs">（任意）</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          disabled={isPending}
          className={inputClass}
          placeholder="candidate@example.com"
        />
        {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
      </div>

      {/* 送信ボタン */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? '作成中...' : '面接セッションを開始'}
      </button>
    </form>
  );
}

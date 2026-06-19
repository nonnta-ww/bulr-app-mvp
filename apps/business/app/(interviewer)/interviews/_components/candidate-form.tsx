'use client';

/**
 * CandidateForm Client Component
 *
 * 候補者情報を入力するフォームコンポーネント。
 * createSession Server Action を呼び出し、バリデーションエラーをフィールドレベルで表示する。
 *
 * Requirements: 3.1, 3.2, 3.3
 */

import Link from 'next/link';
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
  const [consented, setConsented] = useState(false);

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
    'w-full rounded-lg border border-hairline bg-canvas px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy focus:bg-card focus:ring-1 focus:ring-navy disabled:opacity-50';
  const labelClass = 'mb-2 block text-sm font-medium text-body';
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
          候補者名 <span className="text-copper">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          disabled={isPending}
          className={inputClass}
          placeholder="例：佐藤 健太"
        />
        {fieldErrors.name && <p className={errorClass}>{fieldErrors.name}</p>}
      </div>

      {/* 応募職種 */}
      <div>
        <label htmlFor="applied_role" className={labelClass}>
          応募職種 <span className="text-copper">*</span>
        </label>
        <input
          id="applied_role"
          name="applied_role"
          type="text"
          required
          disabled={isPending}
          className={inputClass}
          placeholder="例：バックエンドエンジニア"
        />
        {fieldErrors.applied_role && <p className={errorClass}>{fieldErrors.applied_role}</p>}
      </div>

      {/* 経歴サマリー */}
      <div>
        <label htmlFor="background_summary" className={labelClass}>
          経歴サマリー <span className="text-copper">*</span>
        </label>
        <textarea
          id="background_summary"
          name="background_summary"
          required
          disabled={isPending}
          rows={6}
          className={`${inputClass} resize-y leading-relaxed`}
          placeholder="これまでの経験・スキルを簡潔にまとめてください（5000文字以内）"
        />
        <p className="mt-1.5 text-xs text-muted">
          面接の文脈になる経歴を簡潔に。bulr が優先パターンの選定に使います。
        </p>
        {fieldErrors.background_summary && (
          <p className={errorClass}>{fieldErrors.background_summary}</p>
        )}
      </div>

      {/* メールアドレス（任意） */}
      <div>
        <label htmlFor="email" className={labelClass}>
          メールアドレス <span className="text-xs text-muted">（任意）</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          disabled={isPending}
          className={inputClass}
          placeholder="例：candidate@example.com"
        />
        {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
      </div>

      {/* 同意確認 */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          disabled={isPending}
          className="mt-0.5 h-4 w-4 rounded border-hairline-strong accent-navy"
        />
        <span className="text-sm">
          <span className="block font-medium text-ink">
            候補者から録音・分析の同意を取得済み
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            同意が取れていない場合はセッションを作成しないでください。
          </span>
        </span>
      </label>

      {/* フッターアクション */}
      <div className="-mx-8 flex items-center justify-end gap-3 border-t border-hairline px-8 pt-6 md:-mx-10 md:px-10">
        <Link
          href="/interviews"
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-body transition-colors hover:bg-canvas"
        >
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={isPending || !consented}
          className="rounded-lg bg-navy px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-soft disabled:opacity-50"
        >
          {isPending ? '作成中...' : 'セッションを作成'}
        </button>
      </div>
    </form>
  );
}

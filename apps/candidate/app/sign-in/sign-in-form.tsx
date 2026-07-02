'use client';

/**
 * 候補者サインインフォーム（Client Component）
 *
 * - メール input + 「ログインリンクを送信」ボタン（Magic Link）
 * - react-hook-form + zodResolver による検証（`emailSchema` を共有）
 * - Better Auth `signIn.magicLink` 呼び出し
 * - レート制限エラー判定（"rate limit" 文字列を含む場合）
 * - 送信成功後は「メールを確認してください」状態に切り替え（戻るで再入力へ）
 *
 * Zenith デザイン（docs/design/bulr_personal_growth_dashboard/bulr_11）を適用。
 * 見た目は @theme トークン + 素の Tailwind で実装（@bulr/ui の shadcn トークンは
 * candidate 未定義のため使用しない）。
 *
 * Requirements: 4.2, 4.3, 4.7, 6.4
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { signIn, emailSchema } from '@bulr/auth/client';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const formSchema = z.object({ email: emailSchema });
type FormValues = z.infer<typeof formSchema>;

const CARD_CLASS =
  'flex flex-col items-center rounded-card border border-hairline bg-card p-6 shadow-ambient';

export function SignInForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: FormValues) {
    setStatus('submitting');
    setErrorMessage('');

    try {
      const result = await signIn.magicLink({
        email: values.email,
        // 候補者ポータルのトップへ遷移する。
        callbackURL: '/',
      });

      if (result?.error) {
        const msg = result.error.message ?? '';
        setErrorMessage(toFriendlyError(msg));
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setErrorMessage(toFriendlyError(msg));
      setStatus('error');
    }
  }

  // 送信成功: メール確認を促す
  if (status === 'success') {
    return (
      <div className={`${CARD_CLASS} text-center`}>
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-slate">
          <span className="material-symbols-outlined text-[32px]" aria-hidden="true">
            mail
          </span>
        </div>
        <h2 className="mb-2 text-xl font-medium text-ink">メールを確認してください</h2>
        <p className="leading-relaxed text-body">
          ログイン用のリンクをメールで送信しました。
          <br />
          メール内のボタンをクリックしてログインを完了してください。
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-6 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
        >
          戻る
        </button>
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <div className={CARD_CLASS}>
      {/* ロゴ */}
      <p className="mb-6 text-3xl font-bold tracking-tight text-ink">bulr</p>
      <h1 className="mb-6 w-full text-center text-2xl font-bold text-ink">サインイン</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-left text-sm font-medium text-ink">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled={submitting}
            aria-invalid={errors.email ? 'true' : undefined}
            className="h-12 w-full rounded-lg border border-hairline bg-card px-3 text-base text-ink placeholder:text-muted transition-all focus:border-slate focus:outline-none focus:shadow-[0_0_0_2px_rgba(242,187,167,0.3)] disabled:opacity-50"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-left text-xs text-ember">{errors.email.message}</p>
          )}
        </div>

        {status === 'error' && errorMessage && (
          <p className="rounded-lg bg-[#ffdad6] px-3 py-2 text-sm text-[#93000a]">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary font-bold text-on-primary transition-colors hover:bg-[#d97904] disabled:opacity-50"
        >
          {submitting ? '送信中...' : 'ログインリンクを送信'}
        </button>

        <p className="mt-1 text-center text-xs text-muted">リンクの有効期限は15分です</p>
      </form>
    </div>
  );
}

function toFriendlyError(msg: string): string {
  if (/rate limit/i.test(msg)) {
    return '短時間に多くのリクエストがありました。しばらくお待ちいただき、再度お試しください。';
  }
  return msg || '送信中にエラーが発生しました。もう一度お試しください。';
}

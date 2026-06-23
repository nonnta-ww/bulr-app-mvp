'use client';

/**
 * 面接官サインインフォーム（Client Component）
 *
 * - メール input + 「Magic Link を送信」ボタン
 * - useState で status 管理: 'idle' | 'submitting' | 'success' | 'error'
 * - クライアント側 Zod 検証（emailSchema.safeParse）
 * - Better Auth signIn.magicLink 呼び出し
 * - レート制限エラー判定（"rate limit" 文字列を含む場合）
 *
 * Requirements: 1.8, 8.2, 8.4, 11.1-11.4, 11.7
 */

import { useState } from 'react';

import { signIn, emailSchema } from '@bulr/auth/client';
import { Icon } from '@/components/ui/icon';

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface SignInFormProps {
  /** 招待トークン。指定された場合、magic-link の callbackURL を招待フローへ変更する（Req 2.4） */
  token?: string;
}

export function SignInForm({ token }: SignInFormProps = {}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // token がある場合は招待フローへ、ない場合は従来どおり /interviews へ
  const callbackURL = token ? `/invitations/${token}` : '/interviews';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // クライアント側 Zod 検証 (Requirement 11.3)
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setStatus('error');
      setErrorMessage('正しいメールアドレスを入力してください');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const result = await signIn.magicLink({
        email: parsed.data,
        callbackURL,
      });

      // result.error が存在する場合はエラー処理
      if (result?.error) {
        const msg = result.error.message ?? '';
        if (/rate limit/i.test(msg)) {
          setErrorMessage(
            '短時間に複数回のリクエストがあったため、しばらく待ってから再試行してください',
          );
        } else {
          setErrorMessage(msg || '送信中にエラーが発生しました。もう一度お試しください。');
        }
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/rate limit/i.test(msg)) {
        setErrorMessage(
          '短時間に複数回のリクエストがあったため、しばらく待ってから再試行してください',
        );
      } else {
        setErrorMessage(msg || '送信中にエラーが発生しました。もう一度お試しください。');
      }
      setStatus('error');
    }
  }

  // メール送信完了状態（business_8）
  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-hairline bg-card p-8 shadow-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink">
          <Icon name="mail" size={28} />
        </div>
        <h1 className="mb-4 text-center text-xl font-bold text-ink">メールを確認してください</h1>
        <p className="text-center text-sm leading-relaxed text-body">
          <span className="font-medium text-ink">{email}</span> 宛にログイン用リンクを送信しました。
          <br />
          メール内のリンクをクリックしてログインを完了してください。
        </p>
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-copper hover:underline"
          >
            メールが届かない場合はこちら
            <Icon name="arrow_forward" size={18} />
          </button>
        </div>
      </div>
    );
  }

  // 入力フォーム状態（business_9）
  return (
    <div className="rounded-2xl border border-hairline bg-card p-8 shadow-sm">
      <h1 className="mb-8 text-center text-2xl font-bold text-ink">bulr にサインイン</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-5">
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-body">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.co.jp"
            required
            disabled={status === 'submitting'}
            className="w-full rounded-lg border border-hairline bg-canvas px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy focus:bg-card focus:ring-1 focus:ring-navy disabled:opacity-50"
          />
        </div>

        {status === 'error' && errorMessage && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-lg bg-navy px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-navy-soft focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 disabled:opacity-50"
        >
          {status === 'submitting' ? '送信中...' : 'ログインリンクを送信'}
        </button>

        <p className="mt-5 text-center text-sm leading-relaxed text-muted">
          入力したメールアドレスにログイン用リンクをお送りします（有効期限15分）
        </p>
      </form>
    </div>
  );
}

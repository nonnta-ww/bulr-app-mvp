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

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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
        callbackURL: '/interviews',
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

  if (status === 'success') {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-800">
        メールを送信しました。受信ボックス（迷惑メールフォルダも）をご確認ください。
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={status === 'submitting'}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {status === 'error' && errorMessage && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {status === 'submitting' ? '送信中...' : 'Magic Link を送信'}
      </button>
    </form>
  );
}

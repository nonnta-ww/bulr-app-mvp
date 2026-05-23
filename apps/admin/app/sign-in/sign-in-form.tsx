'use client';

/**
 * 管理者サインインフォーム（Client Component）
 *
 * - メール input + 「Magic Link を送信」ボタン
 * - react-hook-form + zodResolver による検証（`emailSchema` を共有）
 * - Better Auth `signIn.magicLink` 呼び出し
 * - レート制限エラー判定（"rate limit" 文字列を含む場合）
 *
 * apps/business の同名 Form と機能等価。違いは UI primitives を
 * `@bulr/ui` から import している点（Requirement 6.4）と、
 * サインイン後の callbackURL が admin top（`/`）である点。
 *
 * Requirements: 3.2, 3.9, 6.4
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { signIn, emailSchema } from '@bulr/auth/client';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@bulr/ui';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const formSchema = z.object({ email: emailSchema });
type FormValues = z.infer<typeof formSchema>;

export function SignInForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: FormValues) {
    setStatus('submitting');
    setErrorMessage('');

    try {
      const result = await signIn.magicLink({
        email: values.email,
        // 本タスクでは保護ルートが未配置のため admin top（プレースホルダ）に戻す。
        // Task 4.3 で /sessions が移設された後はそちらに切り替える。
        callbackURL: '/',
      });

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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>メールアドレス</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  autoComplete="email"
                  disabled={status === 'submitting'}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {status === 'error' && errorMessage && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        )}

        <Button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full bg-blue-600 text-white hover:bg-blue-700"
        >
          {status === 'submitting' ? '送信中...' : 'Magic Link を送信'}
        </Button>
      </form>
    </Form>
  );
}

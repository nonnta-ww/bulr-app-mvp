'use client';

/**
 * OnboardingForm — オンボーディング用フォーム（Client Component）
 *
 * displayName（お名前）を入力し、createCandidateProfile Server Action を呼び出す。
 * 成功時は Server Action 内で '/' にリダイレクトされる。
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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

import { createCandidateProfile } from './_actions/create-profile';

const formSchema = z.object({
  displayName: z
    .string()
    .min(1, 'お名前を入力してください')
    .max(100, 'お名前は100文字以内で入力してください'),
});
type FormValues = z.infer<typeof formSchema>;

export function OnboardingForm() {
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: '' },
  });

  function onSubmit(values: FormValues) {
    setErrorMessage('');
    startTransition(async () => {
      const result = await createCandidateProfile(values);
      if (result && !result.ok) {
        setErrorMessage(result.error.message ?? 'エラーが発生しました。もう一度お試しください。');
      }
      // 成功時は Server Action 内で redirect('/') が呼ばれる
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>お名前</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="例：山田 太郎"
                  autoComplete="name"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {errorMessage && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white hover:bg-blue-700"
        >
          {isPending ? '作成中...' : 'プロフィールを作成'}
        </Button>
      </form>
    </Form>
  );
}

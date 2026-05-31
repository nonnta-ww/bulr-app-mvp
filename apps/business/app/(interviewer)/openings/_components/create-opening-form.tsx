'use client';

/**
 * CreateOpeningForm — 募集新規作成フォーム（Client Component）
 *
 * title / description / status を入力し、createOpening Server Action を呼び出す。
 * 成功時は Server Action 内で /openings/:id にリダイレクトされる。
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
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

import { createOpening } from '../_actions/create-opening';

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'タイトルを入力してください')
    .max(200, 'タイトルは200文字以内で入力してください'),
  description: z
    .string()
    .trim()
    .max(5000, '説明は5000文字以内で入力してください')
    .optional(),
  status: z.enum(['draft', 'open', 'closed']),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateOpeningForm() {
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'draft',
    },
  });

  function onSubmit(values: FormValues) {
    setErrorMessage('');
    startTransition(async () => {
      const result = await createOpening(values);
      if (result && !result.ok) {
        setErrorMessage(result.error.message ?? 'エラーが発生しました。もう一度お試しください。');
      }
      // 成功時は Server Action 内で redirect('/openings/:id') が呼ばれる
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        {/* タイトル */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>タイトル <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="例：フロントエンドエンジニア（シニア）"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 説明 */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>説明（任意）</FormLabel>
              <FormControl>
                <textarea
                  placeholder="募集要件や仕事内容を入力してください"
                  rows={6}
                  disabled={isPending}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ステータス */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ステータス</FormLabel>
              <FormControl>
                <select
                  disabled={isPending}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...field}
                >
                  <option value="draft">下書き</option>
                  <option value="open">公開中</option>
                  <option value="closed">終了</option>
                </select>
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
          {isPending ? '作成中...' : '募集を作成'}
        </Button>
      </form>
    </Form>
  );
}

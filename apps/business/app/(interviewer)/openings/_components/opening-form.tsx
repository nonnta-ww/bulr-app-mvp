'use client';

/**
 * OpeningForm — 募集の新規作成 / 編集 共通フォーム（Client Component）
 *
 * title / description / status を入力し、mode に応じて
 * createOpening / updateOpening Server Action を呼び出す。
 * 成功時は各 Server Action 内で redirect される。
 *
 * Design: docs/superpowers/specs/2026-06-21-opening-edit-design.md
 */

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import Link from 'next/link';

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@bulr/ui';

import { createOpening } from '../_actions/create-opening';
import { updateOpening } from '../[openingId]/_actions/update-opening';

const FIELD_CLASS =
  'w-full rounded-lg border border-hairline bg-canvas px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy focus:bg-card focus:ring-1 focus:ring-navy disabled:opacity-50';

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

interface OpeningFormProps {
  mode: 'create' | 'edit';
  /** edit モードで対象となる opening の id */
  openingId?: string;
  defaultValues?: Partial<FormValues>;
}

export function OpeningForm({ mode, openingId, defaultValues }: OpeningFormProps) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      status: defaultValues?.status ?? 'draft',
    },
  });

  const cancelHref = mode === 'edit' && openingId ? `/openings/${openingId}` : '/openings';
  const submitLabel = mode === 'edit' ? '保存する' : '作成する';
  const pendingLabel = mode === 'edit' ? '保存中...' : '作成中...';

  function onSubmit(values: FormValues) {
    setErrorMessage('');
    startTransition(async () => {
      const result =
        mode === 'edit' && openingId
          ? await updateOpening({ openingId, ...values })
          : await createOpening(values);
      if (result && !result.ok) {
        setErrorMessage(result.error.message ?? 'エラーが発生しました。もう一度お試しください。');
      }
      // 成功時は Server Action 内で redirect が呼ばれる
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
              <FormLabel className="mb-2 block text-sm font-medium text-body">
                募集タイトル
              </FormLabel>
              <FormControl>
                <input
                  type="text"
                  placeholder="例: シニアフロントエンドエンジニア"
                  disabled={isPending}
                  className={FIELD_CLASS}
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
              <FormLabel className="mb-2 block text-sm font-medium text-body">
                募集内容・求める人物像
              </FormLabel>
              <FormControl>
                <textarea
                  placeholder="ポジションの役割、期待する成果、必要な技術スタックなどを記述してください。"
                  rows={8}
                  disabled={isPending}
                  className={`${FIELD_CLASS} resize-y leading-relaxed`}
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
              <FormLabel className="mb-2 block text-sm font-medium text-body">
                公開ステータス
              </FormLabel>
              <FormControl>
                <select disabled={isPending} className={FIELD_CLASS} {...field}>
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

        {/* フッターアクション */}
        <div className="-mx-8 flex items-center justify-end gap-3 border-t border-hairline px-8 pt-6 md:-mx-10 md:px-10">
          <Link
            href={cancelHref}
            className="rounded-lg border border-hairline bg-card px-5 py-2.5 text-sm font-medium text-body transition-colors hover:bg-canvas"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-navy px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-soft disabled:opacity-50"
          >
            {isPending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </Form>
  );
}

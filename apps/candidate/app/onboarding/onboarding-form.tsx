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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-2 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="displayName" className="text-sm font-medium text-ink">
          表示名
        </label>
        <input
          id="displayName"
          type="text"
          placeholder="山田 太郎"
          autoComplete="name"
          disabled={isPending}
          aria-invalid={errors.displayName ? 'true' : undefined}
          className="h-12 w-full rounded-lg border border-hairline bg-card px-3 text-base text-ink placeholder:text-muted transition-all focus:border-slate focus:outline-none focus:shadow-[0_0_0_2px_rgba(242,187,167,0.3)] disabled:opacity-50"
          {...register('displayName')}
        />
        {errors.displayName && (
          <p className="text-xs text-ember">{errors.displayName.message}</p>
        )}
      </div>

      {errorMessage && (
        <p className="rounded-lg bg-[#ffdad6] px-3 py-2 text-sm text-[#93000a]">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-lg font-bold text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? (
          '作成中...'
        ) : (
          <>
            はじめる
            <span className="material-symbols-outlined fill" aria-hidden="true">
              arrow_forward
            </span>
          </>
        )}
      </button>
    </form>
  );
}

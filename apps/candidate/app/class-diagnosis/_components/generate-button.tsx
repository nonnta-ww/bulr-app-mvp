'use client';

/**
 * GenerateButton — RPG クラス診断 生成/再診断 CTA（Client Component, task 8.1）
 *
 * - クリックで generateClassDiagnosis（入力不要 = {} スキーマ）を呼ぶ。
 * - useTransition で pending を表現し、生成中はボタンを disabled にして「診断中…」表示（Req 6.3）。
 * - candidateAction は auth/Zod/ビジネスエラーを単層 { ok:false, error } に畳むため 1 段階で読む
 *   （self-analysis の generate-button と同一。result.ok を見て、成功なら親が revalidate 済みで再描画）:
 *     1. result.ok === false → エラー（code 別の日本語文言を表示）
 *     2. result.ok === true  → 成功（revalidatePath('/class-diagnosis') 済み → 親 Server Component が再描画）
 * - エラー表示は code 別の日本語文言（NO_VOCATION / RATE_LIMITED / UNAUTHORIZED / その他）。
 * - @bulr/ui Button を使い、candidate はテーマトークン未定義のため明示 Tailwind 配色を className で渡す。
 *
 * Requirements: 6.3, 8.1
 * Boundary: generate-button
 */

import { useState, useTransition } from 'react';

import { Button } from '@bulr/ui';

import { generateClassDiagnosis } from '../_actions/generate-class-diagnosis';

// ---------------------------------------------------------------------------
// エラーコード別の日本語文言マップ
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  NO_VOCATION:
    'スキル診断にまだ回答していません。先にスキルアンケートに回答してください。',
  RATE_LIMITED: '本日の再診断上限に達しました。時間をおいてから再度お試しください。',
  UNAUTHORIZED: '認証が切れました。再度サインインしてください。',
  CANDIDATE_PROFILE_MISSING:
    'プロフィールが未作成です。オンボーディングを完了してください。',
};

/** エラーコードを日本語文言に解決する。不明なコードはフォールバックを返す。 */
function resolveErrorMessage(code: string, fallbackMessage: string): string {
  return ERROR_MESSAGES[code] ?? fallbackMessage;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GenerateButtonProps {
  /** ボタンラベル（例: 「診断する」「再診断する」） */
  label: string;
  /** ボタンの見た目バリアント（省略時: 'default'） */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  /** 追加の className（テーマトークン非依存の明示配色を渡す） */
  className?: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function GenerateButton({ label, variant = 'default', className }: GenerateButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick() {
    setErrorMessage(null);

    startTransition(async () => {
      // 入力不要（generateClassDiagnosisSchema = z.object({})）。
      const result = await generateClassDiagnosis({});

      // candidateAction が auth / Zod / ビジネスエラー（NO_VOCATION / RATE_LIMITED）を
      // 単層 { ok:false, error } に畳むため 1 段階で読む（self-analysis と同一）。
      if (!result.ok) {
        setErrorMessage(resolveErrorMessage(result.error.code, result.error.message));
        return;
      }

      // 成功: revalidatePath('/class-diagnosis') が Server Action 側で呼ばれているため
      // 親 Server Component が自動的に再レンダリングされる（router.refresh 不要）。
      // result.data.status（'complete' | 'partial_no_temperament'）の分岐は page → view 側で処理。
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={isPending} variant={variant} className={className}>
        {isPending ? '診断中…' : label}
      </Button>

      {errorMessage ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

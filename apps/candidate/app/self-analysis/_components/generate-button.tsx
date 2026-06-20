'use client';

/**
 * GenerateButton — 自己分析 生成/再生成 CTA（Client Component）
 *
 * - action props に応じて generateSelfAnalysis または regenerateNarrative を呼ぶ
 * - useTransition で pending を表現し、生成中はボタンを disabled にして「生成中…」表示（Req 1.4）
 * - authedAction の Result を2段階で読む（result.ok → result.data.ok）
 *   1. result.ok === false → auth/Zod エラー（result.error.message を表示）
 *   2. result.ok === true && result.data.ok === false → ビジネスエラー（code 別に日本語文言を表示）
 *   3. result.ok === true && result.data.ok === true → 成功（revalidatePath 済みのため親が再描画）
 * - エラー表示は code 別の日本語文言（NO_RESPONSE / RATE_LIMITED / GENERATION_FAILED / その他）
 *
 * Requirements: 1.4, 4.2, 4.3, 5.2, 8.2
 * Boundary: generate-button
 */

import { useState, useTransition } from 'react';

import { Button } from '@bulr/ui';

import {
  generateSelfAnalysis,
  regenerateNarrative,
} from '../_actions/generate-self-analysis';

// ---------------------------------------------------------------------------
// エラーコード別の日本語文言マップ
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  NO_RESPONSE:
    'skill-survey にまだ回答していません。先に skill-survey に回答してください。',
  RATE_LIMITED: '本日の再生成上限に達しました。時間をおいてから再度お試しください。',
  GENERATION_FAILED:
    '自然言語サマリの再生成に失敗しました。しばらくしてからもう一度お試しください。',
  UNAUTHORIZED: '認証が切れました。再度サインインしてください。',
  CANDIDATE_PROFILE_MISSING: 'プロフィールが未作成です。オンボーディングを完了してください。',
  NO_ANALYSIS: '再生成対象の自己分析が見つかりません。先に自己分析を生成してください。',
};

/** エラーコードを日本語文言に解決する。不明なコードはフォールバックを返す。 */
function resolveErrorMessage(code: string, fallbackMessage: string): string {
  return ERROR_MESSAGES[code] ?? fallbackMessage;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GenerateButtonProps {
  /** 実行するアクションの種別 */
  action: 'generate' | 'regenerate';
  /** ボタンラベル */
  label: string;
  /** ボタンの見た目バリアント（省略時: 'default'） */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  /** 追加の className */
  className?: string;
  /** 対象アンケートの ID（生成系アクションへ渡す） */
  surveyId: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function GenerateButton({
  action,
  label,
  variant = 'default',
  className,
  surveyId,
}: GenerateButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick() {
    setErrorMessage(null);

    startTransition(async () => {
      // action props に応じて呼び分け
      const result =
        action === 'generate'
          ? await generateSelfAnalysis({ surveyId })
          : await regenerateNarrative({ surveyId });

      // --- 2段階読み ---

      // 1段目: authedAction ラッパー層（auth / Zod エラー）
      if (!result.ok) {
        setErrorMessage(resolveErrorMessage(result.error.code, result.error.message));
        return;
      }

      // 2段目: ビジネスロジック層
      if (!result.data.ok) {
        setErrorMessage(resolveErrorMessage(result.data.error.code, result.data.error.message));
        return;
      }

      // 成功: revalidatePath('/self-analysis') が Server Action 側で呼ばれているため
      // 親 Server Component が自動的に再レンダリングされる（router.refresh 不要）
      // status === 'viz_only' の場合も UI の状態分岐は page → self-analysis-view 側で処理
    });
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={isPending}
        variant={variant}
        className={className}
      >
        {isPending ? '生成中…' : label}
      </Button>

      {/* エラーメッセージ表示（code 別日本語文言） */}
      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

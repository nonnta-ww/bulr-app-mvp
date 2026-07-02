/**
 * PatternList — 模擬面接パターン選択コンポーネント（Server Component）
 *
 * - 「面接パターンを選択」見出し + パターンをカードグリッドで表示
 * - 各カードに #code・カテゴリタグ・title・description・「この設定で練習する」ボタン
 * - disabled === true の場合は全ボタンを disabled 属性で無効化
 * - createMockInterviewSessionAction を .bind 形式のフォームアクションで呼び出す
 *
 * Requirements: 要件2
 */

import type { AssessmentPattern, PatternCategory } from '@bulr/db/schema';

import { createMockInterviewSessionAction } from '../_actions/create-session';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** カテゴリ → 短いタグ表記 */
const CATEGORY_TAG: Record<PatternCategory, string> = {
  design: '設計',
  trouble: '障害対応',
  performance: 'パフォーマンス',
  security: 'セキュリティ',
  organization: '組織・チーム',
  ai: 'AI 活用',
};

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function truncate(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

interface Props {
  patterns: AssessmentPattern[];
  disabled: boolean;
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function PatternCard({ pattern, disabled }: { pattern: AssessmentPattern; disabled: boolean }) {
  // .bind で patternCode を部分適用し、戻り値を void に変換して form action の型に合わせる
  const boundAction = createMockInterviewSessionAction.bind(
    null,
    pattern.code,
  ) as unknown as () => Promise<void>;

  return (
    <li className="flex h-full flex-col rounded-card border border-hairline bg-card p-6 shadow-ambient">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">#{pattern.code}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
          {CATEGORY_TAG[pattern.category]}
        </span>
      </div>
      <h3 className="mb-2 text-lg font-bold text-ink">{pattern.title}</h3>
      <p className="mb-6 flex-1 text-sm leading-relaxed text-muted">
        {truncate(pattern.description)}
      </p>
      <form action={boundAction}>
        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          この設定で練習する
        </button>
      </form>
    </li>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function PatternList({ patterns, disabled }: Props) {
  if (patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted">現在利用可能なパターンはありません。</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="pattern-select-heading">
      <h2 id="pattern-select-heading" className="mb-4 text-lg font-bold text-ink">
        面接パターンを選択
      </h2>
      <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {patterns.map((pattern) => (
          <PatternCard key={pattern.id} pattern={pattern} disabled={disabled} />
        ))}
      </ul>
    </section>
  );
}

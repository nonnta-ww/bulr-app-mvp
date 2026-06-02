/**
 * PatternList — 模擬面接パターン選択コンポーネント（Server Component）
 *
 * - hasSkillSurvey === true の場合、上部に「あなたへのおすすめ」セクションとして汎用ヒントを表示
 * - カテゴリ別セクションでパターン一覧を表示
 * - 各カードに title・description（先頭 80 文字）・「このパターンで開始」ボタン
 * - disabled === true の場合は全「開始」ボタンを disabled 属性で無効化
 * - createMockInterviewSessionAction を .bind 形式のフォームアクションで呼び出す
 *
 * Requirements: 要件2
 */

import type { AssessmentPattern, PatternCategory } from '@bulr/db/schema';

import { createMockInterviewSessionAction } from '../_actions/create-session';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: PatternCategory[] = [
  'design',
  'trouble',
  'performance',
  'security',
  'organization',
  'ai',
];

const CATEGORY_LABEL: Record<PatternCategory, string> = {
  design: 'Design（設計）',
  trouble: 'Trouble（障害対応）',
  performance: 'Performance（パフォーマンス）',
  security: 'Security（セキュリティ）',
  organization: 'Organization（組織・チーム）',
  ai: 'AI（AI 活用）',
};

const SKILL_SURVEY_HINT =
  'スキルアンケートの回答に基づき、あなたの経験・関心に近い状況パターンに取り組むことで、より実践的なフィードバックを得やすくなります。カテゴリを参考に、挑戦してみたいパターンを選んでください。';

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
  quotaRemaining: number;
  disabled: boolean;
  hasSkillSurvey: boolean;
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

interface PatternCardProps {
  pattern: AssessmentPattern;
  disabled: boolean;
}

function PatternCard({ pattern, disabled }: PatternCardProps) {
  // .bind で patternCode を部分適用し、戻り値を void に変換して form action の型に合わせる
  const boundAction = createMockInterviewSessionAction.bind(
    null,
    pattern.code,
  ) as unknown as () => Promise<void>;

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">{pattern.title}</h3>
      <p className="mt-1 text-sm text-gray-600">{truncate(pattern.description)}</p>
      <form action={boundAction} className="mt-3">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          このパターンで開始
        </button>
      </form>
    </li>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function PatternList({ patterns, quotaRemaining: _quotaRemaining, disabled, hasSkillSurvey }: Props) {
  // カテゴリ別にパターンをグループ化
  const grouped = CATEGORY_ORDER.reduce<Map<PatternCategory, AssessmentPattern[]>>((map, cat) => {
    const items = patterns.filter((p) => p.category === cat);
    if (items.length > 0) {
      map.set(cat, items);
    }
    return map;
  }, new Map());

  return (
    <div className="space-y-8">
      {/* あなたへのおすすめセクション（スキルアンケート回答済みの場合のみ） */}
      {hasSkillSurvey && (
        <section
          aria-labelledby="recommendation-heading"
          className="rounded-lg border border-blue-200 bg-blue-50 p-5"
        >
          <h2
            id="recommendation-heading"
            className="mb-2 text-sm font-semibold text-blue-800"
          >
            あなたへのおすすめ
          </h2>
          <p className="text-sm text-blue-700">{SKILL_SURVEY_HINT}</p>
        </section>
      )}

      {/* カテゴリ別パターン一覧 */}
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;

        return (
          <section key={cat} aria-labelledby={`category-${cat}-heading`}>
            <h2
              id={`category-${cat}-heading`}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500"
            >
              {CATEGORY_LABEL[cat]}
            </h2>
            <ul className="space-y-3">
              {items.map((pattern) => (
                <PatternCard key={pattern.id} pattern={pattern} disabled={disabled} />
              ))}
            </ul>
          </section>
        );
      })}

      {/* パターンが 0 件の場合 */}
      {patterns.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm text-gray-600">現在利用可能なパターンはありません。</p>
        </div>
      )}
    </div>
  );
}

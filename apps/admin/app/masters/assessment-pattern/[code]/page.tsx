/**
 * 管理画面 アセスメントパターン詳細ページ（apps/admin: /masters/assessment-pattern/[code]）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getAssessmentPatternDetail(code) でパターン詳細を取得し、全フィールドを読み取り専用表示する。
 * 編集ボタンは存在しない（assessment_pattern 編集は Wave 5 以降）。
 *
 * Requirements: 4.1, 4.2, 4.3, 6.1, 6.6
 * Boundary: AssessmentPatternDetailPage (this file only)
 * Depends: 5.1 ✓ (getAssessmentPatternDetail)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getAssessmentPatternDetail } from '@bulr/db/queries/admin';
import type { PatternCategory } from '@bulr/db/schema';

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: params は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ code: string }>;
};

// ---------------------------------------------------------------------------
// カテゴリ表示ラベルマップ
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<PatternCategory, string> = {
  design: 'システム設計',
  trouble: 'トラブル対応',
  performance: 'パフォーマンス',
  security: 'セキュリティ',
  organization: '組織・チーム',
  ai: 'AI 活用',
};

// ---------------------------------------------------------------------------
// ヘルパーコンポーネント
// ---------------------------------------------------------------------------

/** 定義リスト行（ラベル + 値） */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[14rem_1fr] gap-2 py-1.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/** 複数行テキストを pre-wrap で表示するブロック */
function PreText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{text}</p>
  );
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function AssessmentPatternDetailPage({ params }: PageProps) {
  // Layer 2 多層防御: 未認証・非管理者は弾く
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        redirect('/sign-in');
      }
      if (err.code === 'FORBIDDEN') {
        notFound();
      }
    }
    throw err;
  }

  // params のアンラップ（Next.js 16: async）
  const { code } = await params;

  // DBクエリ
  const pattern = await getAssessmentPatternDetail(code);
  if (!pattern) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* パンくず */}
      <nav className="text-sm text-gray-500">
        <Link href="/masters/assessment-pattern" className="hover:underline">
          アセスメントパターン一覧
        </Link>
        <span className="mx-1">{'/'}</span>
        <span className="text-gray-800">{pattern.code}</span>
      </nav>

      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pattern.title}</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">{pattern.code}</p>
        </div>
        {pattern.isActive ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            有効
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            無効
          </span>
        )}
      </div>

      {/* 基本情報 */}
      <section aria-labelledby="basic-info-heading">
        <h2
          id="basic-info-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          基本情報
        </h2>
        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
          <Term label="コード">
            <span className="font-mono">{pattern.code}</span>
          </Term>
          <Term label="カテゴリ">
            {CATEGORY_LABEL[pattern.category] ?? pattern.category}
          </Term>
          <Term label="タイトル">{pattern.title}</Term>
          <Term label="想定スコープ">
            {pattern.expectedScopeMin} 〜 {pattern.expectedScopeMax}
          </Term>
          <Term label="登録日時">
            {new Intl.DateTimeFormat('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
              timeZone: 'Asia/Tokyo',
            })
              .format(pattern.createdAt)
              .replace(/\//g, '-')}
          </Term>
          <Term label="更新日時">
            {new Intl.DateTimeFormat('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
              timeZone: 'Asia/Tokyo',
            })
              .format(pattern.updatedAt)
              .replace(/\//g, '-')}
          </Term>
        </dl>
      </section>

      {/* 説明 */}
      <section aria-labelledby="description-heading">
        <h2
          id="description-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          説明
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <PreText text={pattern.description} />
        </div>
      </section>

      {/* 4 段階評価テンプレート */}
      <section aria-labelledby="levels-heading">
        <h2
          id="levels-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          4 段階評価テンプレート
        </h2>
        <div className="flex flex-col gap-4">
          {[
            { label: 'レベル 1（入門）', text: pattern.level1Intro },
            { label: 'レベル 2（基礎）', text: pattern.level2Focus },
            { label: 'レベル 3（応用）', text: pattern.level3Focus },
            { label: 'レベル 4（熟達）', text: pattern.level4Focus },
          ].map(({ label, text }) => (
            <div
              key={label}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{label}</h3>
              <PreText text={text} />
            </div>
          ))}
        </div>
      </section>

      {/* シグナル */}
      <section aria-labelledby="signals-heading">
        <h2
          id="signals-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          シグナル
        </h2>
        {pattern.signals.length === 0 ? (
          <p className="text-sm text-gray-500">シグナルがありません</p>
        ) : (
          <ul className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {pattern.signals.map((signal, index) => (
              <li key={index} className="flex items-start gap-2 px-4 py-2">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-medium text-indigo-700">
                  {index + 1}
                </span>
                <span className="text-sm text-gray-800">{signal}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AI 観点 */}
      <section aria-labelledby="ai-perspective-heading">
        <h2
          id="ai-perspective-heading"
          className="mb-3 text-base font-semibold text-gray-900"
        >
          AI 観点
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <PreText text={pattern.aiPerspective} />
        </div>
      </section>
    </main>
  );
}

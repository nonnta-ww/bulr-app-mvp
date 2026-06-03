/**
 * 管理画面 アセスメントパターン一覧ページ（apps/admin: /masters/assessment-pattern）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getAssessmentPatternsForAdmin で全パターンを取得してテーブル表示する。
 * 各行に[詳細]リンクを設置する（編集ボタンなし）。
 *
 * Requirements: 4.1, 4.2, 4.3, 6.1, 6.6
 * Boundary: AssessmentPatternListPage (this file only)
 * Depends: 5.1 ✓ (getAssessmentPatternsForAdmin)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getAssessmentPatternsForAdmin } from '@bulr/db/queries/admin';
import type { PatternCategory } from '@bulr/db/schema';

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
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function AssessmentPatternListPage() {
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

  // DBクエリ（全件 code 昇順）
  const patterns = await getAssessmentPatternsForAdmin();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">アセスメントパターン一覧</h1>

      {patterns.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          アセスメントパターンがありません
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">コード</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">カテゴリ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">タイトル</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {patterns.map((pattern) => (
                <tr
                  key={pattern.id}
                  className={`transition-colors hover:bg-gray-50 ${
                    !pattern.isActive ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-sm text-gray-800">{pattern.code}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {CATEGORY_LABEL[pattern.category] ?? pattern.category}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{pattern.title}</td>
                  <td className="px-4 py-3">
                    {pattern.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        有効
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        無効
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/masters/assessment-pattern/${pattern.code}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

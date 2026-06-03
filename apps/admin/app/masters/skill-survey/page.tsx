/**
 * 管理画面 スキルアンケート一覧ページ（apps/admin: /masters/skill-survey）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getSkillSurveyList で全サーベイを取得してカード一覧を描画する。
 * 各カードに[詳細/編集]リンクを設置する。
 *
 * Requirements: 3.1, 6.1, 6.6
 * Boundary: SkillSurveyListPage (this file only)
 * Depends: 4.1 ✓ (getSkillSurveyList)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getSkillSurveyList } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function SkillSurveyListPage() {
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

  // DBクエリ
  const surveys = await getSkillSurveyList();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">スキルアンケート一覧</h1>

      {surveys.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">スキルアンケートがありません</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className={`flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                !survey.isActive ? 'border-gray-200 opacity-60' : 'border-gray-200'
              }`}
            >
              {/* タイトル + ステータスバッジ */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900 leading-snug">
                  {survey.title}
                </h2>
                {survey.isActive ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                    有効
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    無効
                  </span>
                )}
              </div>

              {/* 職種タイプ */}
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-700">職種: </span>
                {survey.jobType}
              </p>

              {/* 詳細/編集リンク */}
              <div className="mt-auto pt-2">
                <Link
                  href={`/masters/skill-survey/${survey.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  詳細 / 編集
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

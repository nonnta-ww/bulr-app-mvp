/**
 * 管理画面 スキルアンケート詳細/編集ページ（apps/admin: /masters/skill-survey/[surveyId]）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getSkillSurveyMaster でカテゴリ→設問→選択肢のツリーを取得し、
 * 各設問に SkillSurveyQuestionForm、各選択肢に SkillSurveyChoiceForm をインライン表示する。
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 6.1, 6.6
 * Boundary: SkillSurveyDetailPage (this file only)
 * Depends: 4.1 ✓ (getSkillSurveyMaster), 9.1 ✓ (updateQuestion), 9.2 ✓ (updateChoice)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { SkillSurveyChoiceForm } from '@/app/_components/skill-survey-choice-form';
import { SkillSurveyQuestionForm } from '@/app/_components/skill-survey-question-form';
import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getSkillSurveyMaster } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// ページ Props（Next.js 16: params は Promise）
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ surveyId: string }>;
};

// ---------------------------------------------------------------------------
// questionType ラベルマップ
// ---------------------------------------------------------------------------

const QUESTION_TYPE_LABEL: Record<string, string> = {
  single_choice: '単一選択',
  multi_choice: '複数選択',
  free_text: '自由記述',
};

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function SkillSurveyDetailPage({ params }: PageProps) {
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
  const { surveyId } = await params;

  // DBクエリ（ツリー取得）
  const tree = await getSkillSurveyMaster(surveyId);
  if (!tree) {
    notFound();
  }

  const { survey, categories } = tree;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* パンくず */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/masters/skill-survey" className="hover:underline">
          スキルアンケート一覧
        </Link>
        <span className="mx-1">{'/'}</span>
        <span className="text-gray-800">{survey.title}</span>
      </nav>

      {/* ヘッダー */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{survey.title}</h1>
          <p className="mt-1 text-sm text-gray-600">
            職種: <span className="font-medium text-gray-800">{survey.jobType}</span>
          </p>
        </div>
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

      {/* カテゴリ → 設問 → 選択肢 ツリー */}
      {categories.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">カテゴリがありません</p>
      ) : (
        <div className="flex flex-col gap-6">
          {categories.map((category) => (
            <section
              key={category.id}
              className="rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              {/* カテゴリヘッダー */}
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 rounded-t-lg">
                <h2 className="text-base font-semibold text-gray-900">
                  {category.name}
                  {category.subcategory && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      — {category.subcategory}
                    </span>
                  )}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">表示順: {category.displayOrder}</p>
              </div>

              {/* 設問一覧 */}
              <div className="px-4 py-3">
                {category.questions.length === 0 ? (
                  <p className="text-sm text-gray-400">設問がありません</p>
                ) : (
                  <div className="flex flex-col gap-6">
                    {category.questions.map((question, qIndex) => (
                      <div key={question.id} className="flex flex-col gap-2">
                        {/* 設問ヘッダー */}
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            Q{qIndex + 1}
                          </span>
                          <span className="text-xs text-gray-500">
                            {QUESTION_TYPE_LABEL[question.questionType] ?? question.questionType}
                          </span>
                          <span className="text-xs text-gray-400">
                            表示順: {question.displayOrder}
                          </span>
                        </div>

                        {/* 設問本文プレビュー */}
                        <p className="text-sm text-gray-800">{question.body}</p>

                        {/* 設問編集フォーム */}
                        <SkillSurveyQuestionForm
                          question={question}
                          surveyId={surveyId}
                        />

                        {/* 選択肢一覧（free_text 以外） */}
                        {question.choices.length > 0 && (
                          <div className="mt-2 ml-4 flex flex-col gap-2">
                            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              選択肢
                            </h4>
                            {question.choices.map((choice) => (
                              <div
                                key={choice.id}
                                className="rounded-md border border-gray-100 bg-white p-2"
                              >
                                <SkillSurveyChoiceForm
                                  choice={choice}
                                  surveyId={surveyId}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

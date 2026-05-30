/**
 * /skill-survey/[surveyId]/result — L1 棚卸し結果表示ページ (Server Component)
 *
 * - requireCandidate() でガード
 * - getLatestResponseByCandidateProfileId(candidate_profile_id, survey_id) で回答取得
 * - 未回答なら /skill-survey/{surveyId} に redirect
 * - カテゴリ → 設問 → 回答内容を構造化表示
 *   - single_choice / multi_choice: 選択した選択肢テキストを列挙
 *   - free_text: 入力テキストをそのまま表示 (LLM 変換・要約なし、assessment-design.md L3 注記準拠)
 * - 数値スコア・他者比較・年収は出さない
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1
 */

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { eq, asc, inArray } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getLatestResponseByCandidateProfileId } from '@bulr/db';
import { skillSurvey, skillSurveyCategory, skillSurveyChoice } from '@bulr/db/schema';

interface PageProps {
  params: Promise<{ surveyId: string }>;
}

export default async function SkillSurveyResultPage({ params }: PageProps) {
  const { surveyId } = await params;

  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  const [survey] = await db
    .select()
    .from(skillSurvey)
    .where(eq(skillSurvey.id, surveyId))
    .limit(1);

  if (!survey) {
    notFound();
  }

  const responseData = await getLatestResponseByCandidateProfileId(candidateProfileId, surveyId);

  if (!responseData) {
    redirect(`/skill-survey/${surveyId}`);
  }

  // カテゴリ取得 (順序付き)
  const categories = await db
    .select()
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId))
    .orderBy(asc(skillSurveyCategory.displayOrder));

  // 該当回答に紐づく選択肢を全件取得し、id → label でマップ化
  const allChoiceIds = responseData.answers.flatMap((a) => a.answer.selectedChoiceIds ?? []);
  const choiceLabels = new Map<string, string>();
  if (allChoiceIds.length > 0) {
    const allChoices = await db
      .select({ id: skillSurveyChoice.id, label: skillSurveyChoice.label })
      .from(skillSurveyChoice)
      .where(inArray(skillSurveyChoice.id, allChoiceIds));
    for (const c of allChoices) {
      choiceLabels.set(c.id, c.label);
    }
  }

  // カテゴリ → 設問の順で表示用にグループ化
  const questionsByCategory = new Map<string, typeof responseData.answers>();
  for (const a of responseData.answers) {
    const list = questionsByCategory.get(a.question.categoryId) ?? [];
    list.push(a);
    questionsByCategory.set(a.question.categoryId, list);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/skill-survey" className="hover:underline">
          ← アンケート一覧に戻る
        </Link>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">{survey.title} の結果</h1>
      <p className="mb-6 text-sm text-gray-600">
        あなたが入力した内容を構造化して表示しています。スコアや他者比較は表示されません。
      </p>

      <div className="mb-6">
        <Link
          href={`/skill-survey/${surveyId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          回答を編集する →
        </Link>
      </div>

      <div className="space-y-8">
        {categories.map((category) => {
          const categoryAnswers = (questionsByCategory.get(category.id) ?? []).sort(
            (a, b) => a.question.displayOrder - b.question.displayOrder,
          );
          if (categoryAnswers.length === 0) return null;
          return (
            <section key={category.id} className="rounded-lg border border-gray-200 p-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                {category.name}
                {category.subcategory ? (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    / {category.subcategory}
                  </span>
                ) : null}
              </h2>
              <dl className="space-y-4">
                {categoryAnswers.map((a) => (
                  <div key={a.answer.id}>
                    <dt className="text-sm font-medium text-gray-700">{a.question.body}</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {a.question.questionType === 'free_text' ? (
                        a.answer.freeText ? (
                          <p className="whitespace-pre-wrap">{a.answer.freeText}</p>
                        ) : (
                          <p className="text-gray-400">（未回答）</p>
                        )
                      ) : (a.answer.selectedChoiceIds ?? []).length === 0 ? (
                        <p className="text-gray-400">（未回答）</p>
                      ) : (
                        <ul className="list-disc pl-5">
                          {(a.answer.selectedChoiceIds ?? []).map((cid) => (
                            <li key={cid}>{choiceLabels.get(cid) ?? cid}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </main>
  );
}

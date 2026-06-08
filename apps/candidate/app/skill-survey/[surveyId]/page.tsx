/**
 * スキルアンケート回答フォームページ（Server Component）
 *
 * - requireCandidate() で認証 + candidate_profile 存在確認
 *   - UNAUTHORIZED → /sign-in
 *   - CANDIDATE_PROFILE_MISSING → /onboarding
 * - surveyId が存在しない場合は notFound() を呼ぶ
 * - マスタデータ（survey + categories + questions + choices）を全件取得して
 *   Client Component に渡す
 * - 既存回答があれば取得して初期値として渡す（再回答時のプリフィル）
 * - クールダウン中はフォームを表示せず再開日を通知するページを表示する（要件 2.1, 2.2）
 *
 * Requirements: 4.2, 7.1, 2.1, 2.2
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getLatestResponseByCandidateProfileId, getLatestResponseSubmittedAt } from '@bulr/db';
import { canReAnswer } from '../../self-analysis/_lib/cooldown';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyQuestion,
  skillSurveyChoice,
} from '@bulr/db/schema';

import {
  SurveyForm,
  type CategoryWithQuestions,
  type QuestionWithChoices,
} from '../_components/survey-form';

// Next.js 15+/16: params is Promise
interface PageProps {
  params: Promise<{ surveyId: string }>;
}

export default async function SurveyFormPage({ params }: PageProps) {
  const { surveyId } = await params;

  // 認証ガード
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

  // survey マスタ取得
  const [survey] = await db
    .select()
    .from(skillSurvey)
    .where(eq(skillSurvey.id, surveyId))
    .limit(1);

  if (!survey) {
    notFound();
  }

  // カテゴリ・設問・選択肢を 3 クエリで取得して JS 側でネスト構造を組み立てる

  const categories = await db
    .select()
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId))
    .orderBy(asc(skillSurveyCategory.displayOrder));

  const categoryIds = categories.map((c) => c.id);

  // カテゴリが 0 件の場合は空のフォームを渡す
  let questionsWithChoices: CategoryWithQuestions[] = [];

  if (categoryIds.length > 0) {
    // カテゴリ配下の全設問を一括取得
    const questions = await db
      .select()
      .from(skillSurveyQuestion)
      .orderBy(asc(skillSurveyQuestion.displayOrder));

    // 該当カテゴリに絞り込み
    const filteredQuestions = questions.filter((q) =>
      categoryIds.includes(q.categoryId),
    );

    const questionIds = filteredQuestions.map((q) => q.id);

    // 全選択肢を一括取得
    const choices =
      questionIds.length > 0
        ? await db
            .select()
            .from(skillSurveyChoice)
            .orderBy(asc(skillSurveyChoice.displayOrder))
        : [];

    // 該当設問に絞り込み
    const filteredChoices = choices.filter((c) =>
      questionIds.includes(c.questionId),
    );

    // JS でネスト構造を構築
    const questionMap = new Map<string, QuestionWithChoices>();
    for (const q of filteredQuestions) {
      questionMap.set(q.id, { ...q, choices: [] });
    }
    for (const c of filteredChoices) {
      questionMap.get(c.questionId)?.choices.push(c);
    }

    questionsWithChoices = categories.map((cat) => ({
      ...cat,
      questions: filteredQuestions
        .filter((q) => q.categoryId === cat.id)
        .map((q) => questionMap.get(q.id)!),
    }));
  } else {
    questionsWithChoices = [];
  }

  // 既存回答を取得（再回答時のプリフィル）
  const existingResponse = await getLatestResponseByCandidateProfileId(
    candidateProfileId,
    surveyId,
  );

  // クールダウン判定（要件 2.1, 2.2）— 初回（existingResponse===null）は常に許可
  const lastSubmittedAt = await getLatestResponseSubmittedAt(candidateProfileId, surveyId);
  const cooldownVerdict = canReAnswer(lastSubmittedAt, new Date());

  // クールダウン中はフォームを表示せず再開日を通知する
  if (!cooldownVerdict.allowed) {
    const nextAvailableAt = cooldownVerdict.nextAvailableAt as Date;
    const resumeDateStr = nextAvailableAt.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-4 text-sm text-gray-500">
          <Link href="/skill-survey" className="hover:underline">
            ← アンケート一覧に戻る
          </Link>
        </nav>
        <h1 className="mb-4 text-2xl font-semibold text-gray-900">{survey.title}</h1>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <p className="text-gray-700">
            このアンケートは前回提出から30日間は再回答できません。
          </p>
          <p className="mt-2 text-gray-700">
            {resumeDateStr}以降に再度ご回答ください。
          </p>
          <div className="mt-6 flex gap-4">
            <Link
              href={`/skill-survey/${surveyId}/result`}
              className="text-sm text-blue-600 hover:underline"
            >
              前回の回答結果を見る →
            </Link>
            <Link
              href="/skill-survey"
              className="text-sm text-gray-500 hover:underline"
            >
              アンケート一覧
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{survey.title}</h1>
        {survey.description && (
          <p className="mt-1 text-sm text-gray-600">{survey.description}</p>
        )}
      </div>
      <SurveyForm
        survey={survey}
        categories={questionsWithChoices}
        existingResponse={existingResponse}
      />
    </main>
  );
}

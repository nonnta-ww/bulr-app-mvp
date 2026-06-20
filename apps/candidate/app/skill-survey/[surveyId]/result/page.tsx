/**
 * /skill-survey/[surveyId]/result — L1 棚卸し結果表示ページ (Server Component)
 *
 * - requireCandidate() でガード（UNAUTHORIZED → /sign-in, CANDIDATE_PROFILE_MISSING → /onboarding）
 * - getLatestResponseByCandidateProfileId で最新回答を取得。未提出なら回答フォームへ redirect（要件 5.5）
 * - master 木（categories + questions + choices）を組み立て、answersToStateMap で回答を Record 化し、
 *   SurveyResult（カテゴリ名単位の構造化カード）に渡す（要件 11.1）
 * - 45 行 category id 単位の独自グルーピングは廃し groupByCategoryName に統一（Issue 1 対応）
 * - 数値スコア・他者比較は出さない（要件 5.4 / 11.4）。解釈・分析は自己診断へ導線で委譲（要件 11.5）
 * - クールダウン中は「回答を編集する」リンクを非表示にし再開日を表示する（要件 2.1, 2.2）
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5, 7.1, 11.1, 11.5, 2.1, 2.2
 */

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getLatestResponseByCandidateProfileId, getLatestResponseSubmittedAt } from '@bulr/db';
import { canReAnswer } from '../../../self-analysis/_lib/cooldown';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyQuestion,
  skillSurveyChoice,
} from '@bulr/db/schema';

import { SurveyResult } from '../../_components/survey-result';
import {
  answersToStateMap,
  type CategoryWithQuestions,
  type QuestionWithChoices,
} from '../../_lib/survey-structure';

interface PageProps {
  params: Promise<{ surveyId: string }>;
}

export default async function SkillSurveyResultPage({ params }: PageProps) {
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

  // 最新回答を取得。未提出ならフォームへ戻す（要件 5.5）
  const responseData = await getLatestResponseByCandidateProfileId(candidateProfileId, surveyId);

  if (!responseData) {
    redirect(`/skill-survey/${surveyId}`);
  }

  // クールダウン判定（要件 2.1, 2.2）— 提出日時を取得して再回答可否を算出する
  const lastSubmittedAt = await getLatestResponseSubmittedAt(candidateProfileId, surveyId);
  const cooldownVerdict = canReAnswer(lastSubmittedAt, new Date());

  // master 木（categories + questions + choices）を組み立てる（form ページと同一スタイル）。
  // choiceLabels（id → label）も同時に構築し、選択肢の表示テキストを解決できるようにする。
  const categories = await db
    .select()
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId))
    .orderBy(asc(skillSurveyCategory.displayOrder));

  const categoryIds = categories.map((c) => c.id);

  let categoryTree: CategoryWithQuestions[] = [];
  const choiceLabels = new Map<string, string>();

  if (categoryIds.length > 0) {
    const questions = await db
      .select()
      .from(skillSurveyQuestion)
      .orderBy(asc(skillSurveyQuestion.displayOrder));
    const filteredQuestions = questions.filter((q) => categoryIds.includes(q.categoryId));
    const questionIds = filteredQuestions.map((q) => q.id);

    const choices =
      questionIds.length > 0
        ? await db
            .select()
            .from(skillSurveyChoice)
            .orderBy(asc(skillSurveyChoice.displayOrder))
        : [];
    const filteredChoices = choices.filter((c) => questionIds.includes(c.questionId));

    const questionMap = new Map<string, QuestionWithChoices>();
    for (const q of filteredQuestions) {
      questionMap.set(q.id, { ...q, choices: [] });
    }
    for (const c of filteredChoices) {
      questionMap.get(c.questionId)?.choices.push(c);
      choiceLabels.set(c.id, c.label);
    }

    categoryTree = categories.map((cat) => ({
      ...cat,
      questions: filteredQuestions
        .filter((q) => q.categoryId === cat.id)
        .map((q) => questionMap.get(q.id)!),
    }));
  }

  // DB の回答配列を questionId キーの state マップへ正規化
  const answers = answersToStateMap(responseData.answers);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/skill-survey" className="hover:underline">
          ← アンケート一覧に戻る
        </Link>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">{survey.title} の結果</h1>

      <div className="mb-6">
        {cooldownVerdict.allowed ? (
          <Link
            href={`/skill-survey/${surveyId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            回答を編集する →
          </Link>
        ) : (
          <p className="text-sm text-gray-400">
            {(cooldownVerdict.nextAvailableAt as Date).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}以降に再回答できます
          </p>
        )}
      </div>

      <SurveyResult
        categories={categoryTree}
        answers={answers}
        choiceLabels={choiceLabels}
        surveyTitle={survey.title}
        surveyId={surveyId}
      />
    </main>
  );
}

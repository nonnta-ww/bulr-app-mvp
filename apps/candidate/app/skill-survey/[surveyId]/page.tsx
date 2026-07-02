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
import { asc, eq, inArray } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getLatestResponseByCandidateProfileId, getLatestResponseSubmittedAt } from '@bulr/db';
import { canReAnswer } from '../../self-analysis/_lib/cooldown';
import { resolveCooldownDays } from '../../self-analysis/_lib/cooldown-config';
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
    // 当該 survey のカテゴリ配下の設問のみ取得（全 survey 横断で取らない）
    const filteredQuestions = await db
      .select()
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, categoryIds))
      .orderBy(asc(skillSurveyQuestion.displayOrder));

    const questionIds = filteredQuestions.map((q) => q.id);

    // 当該設問配下の選択肢のみ取得
    const filteredChoices =
      questionIds.length > 0
        ? await db
            .select()
            .from(skillSurveyChoice)
            .where(inArray(skillSurveyChoice.questionId, questionIds))
            .orderBy(asc(skillSurveyChoice.displayOrder))
        : [];

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
  const cooldownVerdict = canReAnswer(lastSubmittedAt, new Date(), resolveCooldownDays());

  // クールダウン中はフォームを表示せず再開日を通知する
  if (!cooldownVerdict.allowed) {
    const nextAvailableAt = cooldownVerdict.nextAvailableAt as Date;
    const resumeDateStr = nextAvailableAt.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-8 md:px-8 md:py-12">
        <nav className="mb-4">
          <Link
            href="/skill-survey"
            className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              arrow_back
            </span>
            アンケート一覧に戻る
          </Link>
        </nav>
        <h1 className="mb-4 text-2xl font-bold text-ink md:text-3xl">{survey.title}</h1>
        <div className="rounded-card border border-hairline bg-card p-6 shadow-ambient">
          <p className="text-body">このアンケートは前回提出から30日間は再回答できません。</p>
          <p className="mt-2 text-body">{resumeDateStr}以降に再度ご回答ください。</p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href={`/skill-survey/${surveyId}/result`}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate hover:text-ink"
            >
              前回の回答結果を見る
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
            <Link href="/skill-survey" className="text-sm text-muted hover:text-ink">
              アンケート一覧
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8 md:px-8 md:py-12">
      <SurveyForm
        survey={survey}
        categories={questionsWithChoices}
        existingResponse={existingResponse}
      />
    </main>
  );
}

/**
 * 企業側エントリー詳細ページ（Server Component）
 *
 * /openings/[openingId]/entries/[entryId] で企業ユーザーがエントリー詳細を確認できる。
 * - requireCompanyUser() でガード
 * - getEntryWithSnapshots(entryId) でエントリー詳細取得
 * - opening.companyId !== companyId なら notFound()（所有権検証）
 * - 候補者名・ステータス・エントリー日・履歴書・スキルアンケート結果を表示
 * - UpdateStatusButtons: 'submitted' → 'reviewed' / 'rejected' のステータス更新
 * - ResumePreviewButton: 署名 URL 取得 → 新タブで PDF 表示
 * - スキルアンケート: カテゴリ → 設問 → 回答内容を構造化表示
 * - PatternRecommendation: スキルアンケート回答ベースのパターン推奨表示
 * - CreateSessionForm: 面接パターン選択 + セッション作成
 *
 * Requirements: entry-flow 8.1〜8.5, session-from-entry 3.1, 3.4
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq, inArray } from 'drizzle-orm';

import { requireCompanyUser, AuthError } from '@bulr/auth/server';
import { db, getEntryWithSnapshots, getLatestResponseByCandidateProfileId } from '@bulr/db';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db';
import { assessmentPattern, skillSurveyAnswer, skillSurveyCategory, skillSurveyChoice, skillSurveyQuestion } from '@bulr/db/schema';
import type { EntryStatus } from '@bulr/db/schema';

import { ResumePreviewButton } from './_components/resume-preview-button';
import { UpdateStatusButtons } from './_components/update-status-buttons';
import { PatternRecommendation } from './_components/pattern-recommendation';
import { CreateSessionForm } from './_components/create-session-form';
import { matchPatterns } from './_lib/pattern-matching';

// ---------------------------------------------------------------------------
// ステータスラベル・バッジマッピング
// ---------------------------------------------------------------------------

const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  submitted: '提出済み',
  reviewed: '確認済み',
  progressing: '進行中',
  rejected: '不採用',
};

const ENTRY_STATUS_BADGE: Record<EntryStatus, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-green-100 text-green-700',
  progressing: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-600',
};

// ---------------------------------------------------------------------------
// 日時フォーマット (Asia/Tokyo)
// ---------------------------------------------------------------------------

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
});

function formatDateTime(date: Date): string {
  return DATE_TIME_FORMAT.format(date);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ openingId: string; entryId: string }>;
}

export default async function BusinessEntryDetailPage({ params }: PageProps) {
  const { openingId, entryId } = await params;

  // 認証 + 企業所属確認
  let companyId: string;
  try {
    const result = await requireCompanyUser();
    companyId = result.companyId;
  } catch (e) {
    if (e instanceof AuthError) {
      redirect('/sign-in');
    }
    redirect('/sign-in');
  }

  // エントリー詳細取得（スナップショット含む）
  const entryData = await getEntryWithSnapshots(entryId);
  if (!entryData) notFound();

  // 所有権検証: 他社の opening には notFound()
  if (entryData.opening.companyId !== companyId) notFound();

  const { entry, opening, candidateProfile, resumeDocument, skillSurveyResponse } = entryData;

  // ---------------------------------------------------------------------------
  // アクティブな assessment_pattern 取得（パターン選定支援 UI 用）
  // ---------------------------------------------------------------------------

  const activePatterns = await db
    .select()
    .from(assessmentPattern)
    .where(eq(assessmentPattern.is_active, true));

  // ---------------------------------------------------------------------------
  // SkillSurveyResponseWithAnswers 取得（推奨パターン計算 + PatternRecommendation 用）
  // skillSurveyResponse が存在する場合のみ getLatestResponseByCandidateProfileId を呼ぶ
  // ---------------------------------------------------------------------------

  let skillSurveyResponseWithAnswers: SkillSurveyResponseWithAnswers | null = null;
  if (skillSurveyResponse) {
    skillSurveyResponseWithAnswers = await getLatestResponseByCandidateProfileId(
      skillSurveyResponse.candidateProfileId,
      skillSurveyResponse.skillSurveyId,
    );
  }

  // ---------------------------------------------------------------------------
  // 推奨パターンコード計算（キーワードマッチング）
  // ---------------------------------------------------------------------------

  const recommendedPatternCodes: string[] = skillSurveyResponseWithAnswers
    ? matchPatterns(skillSurveyResponseWithAnswers, activePatterns)
        .slice(0, 10)
        .map((m) => m.patternCode)
    : [];

  // ---------------------------------------------------------------------------
  // スキルアンケート回答データ取得（skillSurveyResponse が存在する場合のみ）
  // ---------------------------------------------------------------------------

  type AnswerRow = {
    answer: typeof skillSurveyAnswer.$inferSelect;
    question: typeof skillSurveyQuestion.$inferSelect;
  };
  type CategoryWithAnswers = {
    id: string;
    name: string;
    subcategory: string | null;
    displayOrder: number;
    answers: AnswerRow[];
  };

  let categories: CategoryWithAnswers[] = [];
  let choiceLabels = new Map<string, string>();

  if (skillSurveyResponse) {
    // カテゴリ取得
    const rawCategories = await db
      .select()
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, skillSurveyResponse.skillSurveyId))
      .orderBy(asc(skillSurveyCategory.displayOrder));

    // 回答 + 設問 JOIN
    const answerRows = await db
      .select()
      .from(skillSurveyAnswer)
      .innerJoin(skillSurveyQuestion, eq(skillSurveyAnswer.questionId, skillSurveyQuestion.id))
      .where(eq(skillSurveyAnswer.responseId, skillSurveyResponse.id))
      .orderBy(asc(skillSurveyQuestion.displayOrder));

    const answers: AnswerRow[] = answerRows.map((row) => ({
      answer: row.skill_survey_answer,
      question: row.skill_survey_question,
    }));

    // 選択肢 ID → ラベルマップ
    const allChoiceIds = answers.flatMap((a) => a.answer.selectedChoiceIds ?? []);
    if (allChoiceIds.length > 0) {
      const allChoices = await db
        .select({ id: skillSurveyChoice.id, label: skillSurveyChoice.label })
        .from(skillSurveyChoice)
        .where(inArray(skillSurveyChoice.id, allChoiceIds));
      for (const c of allChoices) {
        choiceLabels.set(c.id, c.label);
      }
    }

    // カテゴリ別グループ化
    const answersByCategory = new Map<string, AnswerRow[]>();
    for (const a of answers) {
      const list = answersByCategory.get(a.question.categoryId) ?? [];
      list.push(a);
      answersByCategory.set(a.question.categoryId, list);
    }

    categories = rawCategories
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        subcategory: cat.subcategory,
        displayOrder: cat.displayOrder,
        answers: (answersByCategory.get(cat.id) ?? []).sort(
          (a, b) => a.question.displayOrder - b.question.displayOrder,
        ),
      }))
      .filter((cat) => cat.answers.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* パンくず */}
        <nav className="text-sm text-gray-500">
          <Link href="/openings" className="hover:text-blue-600 hover:underline">
            募集一覧
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/openings/${openingId}`}
            className="hover:text-blue-600 hover:underline"
          >
            {opening.title}
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/openings/${openingId}/entries`}
            className="hover:text-blue-600 hover:underline"
          >
            エントリー一覧
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{candidateProfile.displayName}</span>
        </nav>

        {/* 候補者基本情報 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">エントリー詳細</h1>

          <dl className="space-y-3">
            <div className="flex gap-4">
              <dt className="w-32 shrink-0 text-sm font-medium text-gray-500">候補者名</dt>
              <dd className="text-sm text-gray-900">{candidateProfile.displayName}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 shrink-0 text-sm font-medium text-gray-500">募集ポジション</dt>
              <dd className="text-sm text-gray-900">{opening.title}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 shrink-0 text-sm font-medium text-gray-500">エントリー日時</dt>
              <dd className="text-sm text-gray-900">{formatDateTime(entry.createdAt)}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 shrink-0 text-sm font-medium text-gray-500">ステータス</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ENTRY_STATUS_BADGE[entry.status]}`}
                >
                  {ENTRY_STATUS_LABEL[entry.status]}
                </span>
              </dd>
            </div>
          </dl>

          {/* ステータス更新ボタン（submitted のときのみ） */}
          {entry.status === 'submitted' && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="mb-3 text-sm font-medium text-gray-700">ステータスを更新する</p>
              <UpdateStatusButtons
                entryId={entryId}
                openingId={openingId}
                currentStatus={entry.status}
              />
            </div>
          )}
        </section>

        {/* 履歴書セクション */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">履歴書</h2>
          {resumeDocument ? (
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-700">{resumeDocument.originalFilename}</p>
              <ResumePreviewButton entryId={entryId} openingId={openingId} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">履歴書未登録</p>
          )}
        </section>

        {/* スキルアンケート結果セクション */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">スキルアンケート結果</h2>
          {skillSurveyResponse ? (
            categories.length > 0 ? (
              <div className="space-y-6">
                {categories.map((category) => (
                  <div key={category.id} className="rounded-lg border border-gray-200 p-4">
                    <h3 className="mb-3 text-base font-semibold text-gray-900">
                      {category.name}
                      {category.subcategory && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          / {category.subcategory}
                        </span>
                      )}
                    </h3>
                    <dl className="space-y-3">
                      {category.answers.map((a) => (
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">回答が見つかりませんでした。</p>
            )
          ) : (
            <p className="text-sm text-gray-400">未回答</p>
          )}
        </section>

        {/* 推奨パターン（参考） */}
        <PatternRecommendation
          skillSurveyResponse={skillSurveyResponseWithAnswers}
          patterns={activePatterns}
        />

        {/* 面接パターン選択 + セッション作成 */}
        <CreateSessionForm
          entryId={entryId}
          recommendedPatternCodes={recommendedPatternCodes}
          allPatterns={activePatterns}
        />

        {/* 戻りリンク */}
        <div>
          <Link
            href={`/openings/${openingId}/entries`}
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            ← エントリー一覧に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}

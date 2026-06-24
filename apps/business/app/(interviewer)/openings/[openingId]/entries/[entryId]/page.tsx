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

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, eq, inArray } from 'drizzle-orm';

import { db, getEntryWithSnapshots, getLatestResponseByCandidateProfileId } from '@bulr/db';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db';
import { assessmentPattern, skillSurveyAnswer, skillSurveyCategory, skillSurveyChoice, skillSurveyQuestion } from '@bulr/db/schema';

import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ENTRY_STATUS_LABEL, ENTRY_STATUS_TONE } from '@/lib/status';
import { requireCompanyGate } from '@/lib/company-gate';

import { ResumePreviewButton } from './_components/resume-preview-button';
import { UpdateStatusButtons } from './_components/update-status-buttons';
import { PatternRecommendation } from './_components/pattern-recommendation';
import { CreateSessionForm } from './_components/create-session-form';
import { matchPatterns } from './_lib/pattern-matching';

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
  const { companyId } = await requireCompanyGate();

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
  const choiceLabels = new Map<string, string>();

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
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-[1280px]">
        {/* パンくず */}
        <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/openings" className="hover:text-ink">
            募集
          </Link>
          <span className="text-hairline-strong">/</span>
          <Link href={`/openings/${openingId}`} className="hover:text-ink">
            {opening.title}
          </Link>
          <span className="text-hairline-strong">/</span>
          <Link href={`/openings/${openingId}/entries`} className="hover:text-ink">
            エントリー
          </Link>
          <span className="text-hairline-strong">/</span>
          <span className="text-ink">{candidateProfile.displayName}</span>
        </nav>

        {/* 候補者ヘッダー */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-nav-active text-lg font-medium text-nav-active-ink">
              {candidateProfile.displayName.charAt(0)}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                {candidateProfile.displayName}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-body">
                <span>{opening.title} へのエントリー</span>
                <Badge tone={ENTRY_STATUS_TONE[entry.status]}>
                  {ENTRY_STATUS_LABEL[entry.status]}
                </Badge>
                <span className="flex items-center gap-1 text-xs tabular-nums text-muted">
                  <Icon name="calendar_today" size={14} />
                  {formatDateTime(entry.createdAt)}
                </span>
              </p>
            </div>
          </div>
          {entry.status === 'submitted' && (
            <UpdateStatusButtons
              entryId={entryId}
              openingId={openingId}
              currentStatus={entry.status}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* 左カラム */}
          <div className="space-y-6">
            {/* 書類 */}
            <section className="rounded-xl border border-hairline bg-card p-6">
              <h2 className="mb-4 border-b border-hairline pb-3 text-base font-semibold text-ink">
                提出書類
              </h2>
              {resumeDocument ? (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline px-4 py-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Icon name="description" size={22} className="shrink-0 text-muted" />
                    <span className="truncate text-sm text-ink">
                      {resumeDocument.originalFilename}
                    </span>
                  </div>
                  <ResumePreviewButton entryId={entryId} openingId={openingId} />
                </div>
              ) : (
                <p className="text-sm text-muted">履歴書未登録</p>
              )}
            </section>

            {/* スキルアンケート結果 */}
            <section className="rounded-xl border border-hairline bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 border-b border-hairline pb-3 text-base font-semibold text-ink">
                <Icon name="assignment" size={20} className="text-muted" />
                スキルアンケート結果
              </h2>
              {skillSurveyResponse ? (
                categories.length > 0 ? (
                  <div className="space-y-6">
                    {categories.map((category) => (
                      <div key={category.id}>
                        <h3 className="mb-3 text-sm font-bold text-navy">
                          {category.name}
                          {category.subcategory && (
                            <span className="ml-2 text-xs font-normal text-muted">
                              / {category.subcategory}
                            </span>
                          )}
                        </h3>
                        <dl className="space-y-4">
                          {category.answers.map((a) => (
                            <div key={a.answer.id}>
                              <dt className="text-sm font-medium text-body">{a.question.body}</dt>
                              <dd className="mt-1 text-sm leading-relaxed text-ink">
                                {a.question.questionType === 'free_text' ? (
                                  a.answer.freeText ? (
                                    <p className="whitespace-pre-wrap">{a.answer.freeText}</p>
                                  ) : (
                                    <p className="text-muted">（未回答）</p>
                                  )
                                ) : (a.answer.selectedChoiceIds ?? []).length === 0 ? (
                                  <p className="text-muted">（未回答）</p>
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
                  <p className="text-sm text-muted">回答が見つかりませんでした。</p>
                )
              ) : (
                <p className="text-sm text-muted">未回答</p>
              )}
            </section>
          </div>

          {/* 右カラム */}
          <aside className="space-y-6">
            <PatternRecommendation
              skillSurveyResponse={skillSurveyResponseWithAnswers}
              patterns={activePatterns}
            />
            <CreateSessionForm
              entryId={entryId}
              recommendedPatternCodes={recommendedPatternCodes}
              allPatterns={activePatterns}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

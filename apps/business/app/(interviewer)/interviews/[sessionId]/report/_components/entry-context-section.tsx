/**
 * EntryContextSection — 面接後レポートの entry コンテキスト補足セクション（Server Component）
 *
 * - stage2 セッション（entry 経由）の場合のみ表示
 * - opening.title + company.name + candidateProfile.displayName を表示（要件 6.1）
 * - skillSurveyResponse が存在する場合: 回答カテゴリ・スキル一覧のサマリーを表示（要件 6.2）
 * - skillSurveyResponse が null の場合: 「スキルアンケート回答なし」を表示（要件 6.4）
 *
 * CONCERNS: design 上の InterviewSessionResult.skillSurveyResponse は回答を含まない
 * bare response row のみ。カテゴリ・スキルのサマリー表示のため、
 * getLatestResponseByCandidateProfileId で SkillSurveyResponseWithAnswers を追加フェッチする。
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { inArray } from 'drizzle-orm';
import { db, getLatestResponseByCandidateProfileId } from '@bulr/db';
import type { InterviewSessionResult } from '@bulr/db';
import { skillSurveyCategory } from '@bulr/db/schema';

interface Props {
  session: InterviewSessionResult;
}

export async function EntryContextSection({ session }: Props) {
  // stage1 セッション（entry_id=NULL）の場合は表示しない（要件 6.3）
  if (session.kind === 'stage1') return null;

  // stage2 セッション: opening / company / candidateProfile は必ず存在する
  const { opening, company, candidateProfile, skillSurveyResponse } = session;

  // スキルアンケート回答サマリーの取得（skillSurveyResponse が存在する場合のみ）
  let surveySummary: SurveySummary | null = null;
  if (skillSurveyResponse !== null) {
    const responseWithAnswers = await getLatestResponseByCandidateProfileId(
      skillSurveyResponse.candidateProfileId,
      skillSurveyResponse.skillSurveyId,
    );
    if (responseWithAnswers && responseWithAnswers.answers.length > 0) {
      surveySummary = await buildSurveySummary(responseWithAnswers.answers);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">エントリー情報</h2>

      {/* 基本情報: opening / company / candidateProfile（要件 6.1） */}
      <dl className="mb-6 space-y-2">
        <div className="flex gap-4">
          <dt className="w-36 shrink-0 text-sm font-medium text-gray-500">候補者名</dt>
          <dd className="text-sm text-gray-900">{candidateProfile.displayName}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-36 shrink-0 text-sm font-medium text-gray-500">募集ポジション</dt>
          <dd className="text-sm text-gray-900">{opening.title}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-36 shrink-0 text-sm font-medium text-gray-500">企業名</dt>
          <dd className="text-sm text-gray-900">{company.name}</dd>
        </div>
      </dl>

      {/* スキルアンケートサマリー（要件 6.2 / 6.4） */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">スキルアンケート</h3>
        {skillSurveyResponse === null ? (
          // 要件 6.4: skill_survey_response_id が NULL の場合
          <p className="text-sm text-gray-400">スキルアンケート回答なし</p>
        ) : surveySummary === null || surveySummary.categories.length === 0 ? (
          // 回答はあるが回答データが取得できなかった場合
          <p className="text-sm text-gray-400">スキルアンケート回答なし</p>
        ) : (
          // 要件 6.2: 回答カテゴリ・スキル一覧のサマリーを表示
          <div className="space-y-3">
            {surveySummary.categories.map((category) => (
              <div key={category.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold text-gray-700">
                  {category.name}
                  {category.subcategory && (
                    <span className="ml-1.5 font-normal text-gray-500">
                      / {category.subcategory}
                    </span>
                  )}
                </p>
                <ul className="space-y-0.5">
                  {category.questions.map((q) => (
                    <li key={q.id} className="text-xs text-gray-600">
                      · {q.body}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Internal types & helpers
// ---------------------------------------------------------------------------

type SurveySummaryCategory = {
  id: string;
  name: string;
  subcategory: string | null;
  displayOrder: number;
  questions: Array<{ id: string; body: string; displayOrder: number }>;
};

type SurveySummary = {
  categories: SurveySummaryCategory[];
};

type AnswerRow = {
  answer: { id: string; questionId: string };
  question: { id: string; categoryId: string; body: string; displayOrder: number };
};

/**
 * 回答セットからカテゴリ別にグループ化したサマリー構造を構築する。
 * カテゴリ名は DB から取得する。
 */
async function buildSurveySummary(answers: AnswerRow[]): Promise<SurveySummary> {
  // 回答に登場するカテゴリ ID を収集
  const categoryIds = [...new Set(answers.map((a) => a.question.categoryId))];

  if (categoryIds.length === 0) {
    return { categories: [] };
  }

  // カテゴリ詳細を一括取得
  const categoryRows = await db
    .select({
      id: skillSurveyCategory.id,
      name: skillSurveyCategory.name,
      subcategory: skillSurveyCategory.subcategory,
      displayOrder: skillSurveyCategory.displayOrder,
    })
    .from(skillSurveyCategory)
    .where(inArray(skillSurveyCategory.id, categoryIds));

  // カテゴリ別に設問をグループ化
  const questionsByCategory = new Map<string, Array<{ id: string; body: string; displayOrder: number }>>();
  for (const a of answers) {
    const list = questionsByCategory.get(a.question.categoryId) ?? [];
    // 同じ設問の重複を除く
    if (!list.some((q) => q.id === a.question.id)) {
      list.push({
        id: a.question.id,
        body: a.question.body,
        displayOrder: a.question.displayOrder,
      });
    }
    questionsByCategory.set(a.question.categoryId, list);
  }

  const categories: SurveySummaryCategory[] = categoryRows
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      subcategory: cat.subcategory,
      displayOrder: cat.displayOrder,
      questions: (questionsByCategory.get(cat.id) ?? []).sort(
        (a, b) => a.displayOrder - b.displayOrder,
      ),
    }))
    .filter((cat) => cat.questions.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return { categories };
}

/**
 * SurveyResult — L1 棚卸し結果の構造化カード表示（presentational）
 *
 * - groupByCategoryName でカテゴリ名 → サブカテゴリ → 設問の構造化カードに整形
 * - 選択肢は choice id → label を解決してチップ表示、自由記述は入力どおり整形表示
 * - 数値スコア・強み弱み解釈・他者比較・成長アクションは描画しない（要件 11.4）
 * - 自己診断（/self-analysis）への導線カードを置く（要件 11.5）
 *
 * Pure presentational Server Component: データ取得・state・副作用なし。
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 * Boundary: SurveyResultView
 */

import Link from 'next/link';

import { groupByCategoryName, isAnswered } from '../_lib/survey-structure';
import type { CategoryWithQuestions, AnswerState } from '../_lib/survey-structure';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyResultProps {
  /** マスタ木（page.tsx が構築した CategoryWithQuestions[]）*/
  categories: CategoryWithQuestions[];
  /** questionId キーの回答 state マップ（answersToStateMap 経由） */
  answers: Record<string, AnswerState>;
  /** choice id → label の解決マップ */
  choiceLabels: Map<string, string>;
  /** 結果対象のアンケート ID（自己分析詳細への導線に使用） */
  surveyId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyResult({ categories, answers, choiceLabels, surveyId }: SurveyResultProps) {
  const steps = groupByCategoryName(categories);

  return (
    <div className="space-y-6">
      {/* カテゴリ名 → サブカテゴリ → 設問の構造化カード（要件 11.1） */}
      {steps.map((step) => (
        <section
          key={step.categoryName}
          className="rounded-card border border-hairline bg-card p-6 shadow-ambient"
          aria-labelledby={`category-heading-${step.stepIndex}`}
        >
          {/* カテゴリ名ヘッダ（アイコン付き） */}
          <div className="mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              category
            </span>
            <h2 id={`category-heading-${step.stepIndex}`} className="text-xl font-bold text-ink">
              {step.categoryName}
            </h2>
          </div>

          {/* サブカテゴリ → 設問グループ（要件 11.1） */}
          <div className="space-y-6">
            {step.subgroups.map((sg, sgIndex) => (
              <div key={sg.subcategory ?? `sg-${sgIndex}`} className="space-y-5">
                {sg.subcategory && (
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {sg.subcategory}
                  </h3>
                )}

                {sg.questions.map((q) => {
                  const answerState = answers[q.id];
                  const answered = isAnswered(q, answerState);

                  return (
                    <div key={q.id}>
                      {/* 設問文 */}
                      <p className="mb-2 text-sm text-body">{q.body}</p>

                      {/* 回答内容（要件 11.3） */}
                      {q.questionType === 'free_text' ? (
                        answered && answerState?.freeText ? (
                          <p className="whitespace-pre-wrap text-sm text-ink">
                            {answerState.freeText}
                          </p>
                        ) : (
                          <p className="text-sm text-muted">（未回答）</p>
                        )
                      ) : answered && (answerState?.selectedChoiceIds?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {(answerState?.selectedChoiceIds ?? []).map((cid) => (
                            <span
                              key={cid}
                              className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-[#8f4d00]"
                            >
                              {choiceLabels.get(cid) ?? cid}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted">（未回答）</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 次アクション: 自己分析への主要 CTA（要件 11.5） */}
      <div className="rounded-card border border-hairline bg-card p-6 shadow-ambient">
        <h2 className="text-base font-bold text-ink">次は自己分析へ</h2>
        <p className="mt-1 text-sm text-body">
          回答内容をもとに、あなたの強み・弱み・成長アクションを確認できます。
        </p>
        <Link
          href={`/self-analysis/${surveyId}`}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          自己分析を見る
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}

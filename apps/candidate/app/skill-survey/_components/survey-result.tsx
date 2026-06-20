/**
 * SurveyResult — L1 棚卸し結果の構造化カード表示（presentational）
 *
 * - groupByCategoryName でカテゴリ名 → サブカテゴリ → 設問の構造化カードに整形
 * - categoryStatus / isAnswered（共有定義）で回答済み/未回答バッジを描画
 * - 選択肢は choice id → label を解決して表示
 * - 自由記述は入力どおり整形表示（whitespace-pre-wrap）
 * - 数値スコア・強み弱み解釈・他者比較・成長アクションは描画しない
 * - 自己診断（/self-analysis）への導線リンクを置く
 *
 * Pure presentational Server Component: データ取得・state・副作用なし。
 * 'use client' 不要（サーバ側で props が揃う）。
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 * Boundary: SurveyResultView
 */

import Link from 'next/link';

import {
  groupByCategoryName,
  categoryStatus,
  isAnswered,
} from '../_lib/survey-structure';
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
  /** サーベイタイトル（任意。ページヘッダ補足用） */
  surveyTitle?: string;
  /** 結果対象のアンケート ID（自己分析詳細への導線に使用） */
  surveyId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyResult({
  categories,
  answers,
  choiceLabels,
  surveyTitle,
  surveyId,
}: SurveyResultProps) {
  const steps = groupByCategoryName(categories);

  return (
    <div className="space-y-6">
      {/* 完了バナー: アンケート回答済みを明示 */}
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"
          aria-hidden="true"
        >
          ✓
        </span>
        <p className="text-sm font-medium text-emerald-800">
          アンケートに回答しました。棚卸しが完了です。
        </p>
      </div>

      {/* ページ説明 */}
      <p className="text-sm text-gray-600">
        {surveyTitle
          ? `「${surveyTitle}」のL1棚卸し結果です。`
          : 'あなたが入力した内容を構造化して表示しています。'}
        スコアや他者比較は表示されません。
      </p>

      {/* 次アクション: 自己分析への主要 CTA（要件 11.5） */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-base font-semibold text-blue-900">次は自己分析へ</h2>
        <p className="mt-1 text-sm text-blue-800">
          回答内容をもとに、あなたの強み・弱み・成長アクションを確認できます。
        </p>
        <Link
          href={`/self-analysis/${surveyId}`}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          自己分析を見る →
        </Link>
      </div>

      {/* カテゴリ名 → サブカテゴリ → 設問の構造化カード（要件 11.1） */}
      <div className="space-y-8">
        {steps.map((step) => {
          const status = categoryStatus(step, answers);
          const isStepAnswered = status === 'answered';

          return (
            <section
              key={step.categoryName}
              className="rounded-lg border border-gray-200 p-6"
              aria-labelledby={`category-heading-${step.stepIndex}`}
            >
              {/* カテゴリ名ヘッダ + 回答済み/未回答バッジ（要件 11.2） */}
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2
                  id={`category-heading-${step.stepIndex}`}
                  className="text-lg font-semibold text-gray-900"
                >
                  {step.categoryName}
                </h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isStepAnswered
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  aria-label={isStepAnswered ? '回答済み' : '未回答'}
                >
                  {isStepAnswered ? '回答済み' : '未回答'}
                </span>
              </div>

              {/* サブカテゴリ → 設問グループ（要件 11.1） */}
              <div className="space-y-6">
                {step.subgroups.map((sg, sgIndex) => (
                  <div key={sg.subcategory ?? `sg-${sgIndex}`}>
                    {/* サブカテゴリ見出し（存在する場合のみ） */}
                    {sg.subcategory ? (
                      <h3 className="mb-3 text-sm font-medium text-gray-500">
                        {sg.subcategory}
                      </h3>
                    ) : null}

                    {/* 設問一覧 */}
                    <dl className="space-y-4">
                      {sg.questions.map((q) => {
                        const answerState = answers[q.id];
                        const answered = isAnswered(q, answerState);

                        return (
                          <div key={q.id} className="border-l-2 border-gray-100 pl-3">
                            {/* 設問文 */}
                            <dt className="text-sm font-medium text-gray-700">{q.body}</dt>

                            {/* 回答内容（要件 11.3） */}
                            <dd className="mt-1 text-sm text-gray-900">
                              {q.questionType === 'free_text' ? (
                                answered && answerState?.freeText ? (
                                  <p className="whitespace-pre-wrap">{answerState.freeText}</p>
                                ) : (
                                  <p className="text-gray-400">（未回答）</p>
                                )
                              ) : answered &&
                                (answerState?.selectedChoiceIds?.length ?? 0) > 0 ? (
                                <ul className="list-disc pl-5">
                                  {(answerState?.selectedChoiceIds ?? []).map((cid) => (
                                    <li key={cid}>
                                      {choiceLabels.get(cid) ?? cid}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-gray-400">（未回答）</p>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ページ末尾の自己診断導線（スクロール後にも見えるよう重複設置、要件 11.5） */}
      <div className="border-t border-gray-200 pt-6 text-center">
        <p className="mb-3 text-sm text-gray-600">
          スキルの強み・弱みをさらに詳しく分析しますか？
        </p>
        <Link
          href={`/self-analysis/${surveyId}`}
          className="inline-block rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          自己分析を見る →
        </Link>
      </div>
    </div>
  );
}

/**
 * 網羅度可視化コンポーネント（Server Component）
 *
 * AggregatedSnapshot を受け取り、カテゴリ別の網羅度バーを Tailwind で描画する。
 * - カテゴリ名・網羅度バー（coverageRatio）・回答数/総問数・選択の広さ・自由記述有無を表示
 * - 全体網羅度（overallCoverageRatio）のサマリを表示
 * - 数値スコアによる序列化・偏差値・他者比較・順位は一切表示しない（Req 2.3）
 * - charting lib は使用しない（Tailwind バーのみ、design constraint）
 *
 * Boundary: coverage-bars
 * Requirements: 2.1, 2.3
 */

import type { AggregatedSnapshot } from '@bulr/db';
import { Card, CardContent, CardHeader, CardTitle, cn } from '@bulr/ui';

interface CoverageBarsProps {
  snapshot: AggregatedSnapshot;
}

/** coverageRatio（0..1）を 0〜100 の整数パーセントに変換する */
function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

/** 網羅度パーセンテージに応じたバーの色クラスを返す */
function barColorClass(percent: number): string {
  if (percent >= 80) return 'bg-emerald-500';
  if (percent >= 50) return 'bg-amber-400';
  return 'bg-rose-400';
}

export function CoverageBars({ snapshot }: CoverageBarsProps) {
  const overallPercent = toPercent(snapshot.overallCoverageRatio);

  return (
    <div className="space-y-6">
      {/* 全体網羅度サマリ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900">
            全体の回答網羅度
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {/* バー */}
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn('h-full rounded-full transition-all', barColorClass(overallPercent))}
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            {/* パーセント表示（自己網羅度のみ） */}
            <span className="w-12 text-right text-sm font-medium text-gray-700">
              {overallPercent}%
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            あなたが回答した設問の割合です（他者との比較ではありません）
          </p>
        </CardContent>
      </Card>

      {/* カテゴリ別網羅度 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">カテゴリ別の回答状況</h3>
        {snapshot.categories.map((category, index) => {
          const percent = toPercent(category.coverageRatio);
          return (
            // index 併用で一意化（保存済みスナップショットが同名カテゴリを含む場合に備える）
            <Card key={`${category.categoryName}-${index}`}>
              <CardContent className="py-4">
                {/* カテゴリ名 */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {category.categoryName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {category.answeredQuestions} / {category.totalQuestions} 問
                  </span>
                </div>

                {/* 網羅度バー */}
                <div className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        barColorClass(percent),
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-gray-600">
                    {percent}%
                  </span>
                </div>

                {/* 選択の広さ・自由記述有無 */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    選択数: {category.selectedBreadth}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-xs',
                      category.freeTextPresence
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    自由記述: {category.freeTextPresence ? '記述あり' : 'なし'}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 管理画面 LLM コストダッシュボードページ（apps/admin: /monitoring）
 *
 * Server Component。Layer 2 多層防御として requireAdmin() を先頭で呼び出す。
 * getLlmCostMetrics() でデータを取得して合計コスト・日次トレンド・候補者別上位を表示する。
 * チャートライブラリは不使用（HTML テーブル + CSS バーのみ）。
 * 読み取り専用（ミューテーションなし）。
 *
 * Requirements: 5.1, 5.2, 5.5, 6.1
 * Boundary: MonitoringPage (this file only)
 * Depends: 6.1 ✓ (getLlmCostMetrics), 6.2 ✓ (monitoring-query), 6.3 ✓ (monitoring-query)
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AuthError, requireAdmin } from '@bulr/auth/server';
import { getLlmCostMetrics } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** USD を「$0.0000」形式に整形する */
function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

/** トークン数をロケール区切りで整形する */
function formatTokens(value: number): string {
  return value.toLocaleString('ja-JP');
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

export default async function MonitoringPage() {
  // Layer 2 多層防御: 未認証・非管理者は弾く
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') {
        redirect('/sign-in');
      }
      if (err.code === 'FORBIDDEN') {
        notFound();
      }
    }
    throw err;
  }

  // DBクエリ
  const metrics = await getLlmCostMetrics();

  // 日次トレンド用バー幅計算（最大値を 100% とする）
  const maxDailyUsd = metrics.dailyTrend.reduce(
    (max, row) => Math.max(max, row.usd),
    0,
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">LLM コストダッシュボード</h1>
        <Link
          href="/monitoring/quota"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          クォータ使用状況 →
        </Link>
      </div>

      {/* ========== サマリーカード ========== */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">合計（全期間）</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">合計コスト（USD）</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {formatUsd(metrics.totalUsd)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">合計入力トークン</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {formatTokens(metrics.totalInputTokens)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">合計出力トークン</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {formatTokens(metrics.totalOutputTokens)}
            </p>
          </div>
        </div>
      </section>

      {/* ========== モデル別内訳 ========== */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">モデル別内訳</h2>
        {metrics.modelBreakdown.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">モデル</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">コスト（USD）</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">入力トークン</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">出力トークン</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">セッション数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {metrics.modelBreakdown.map((row) => (
                  <tr key={row.model} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.model}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatUsd(row.estimatedUsd)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatTokens(row.inputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatTokens(row.outputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.sessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========== 機能別内訳 ========== */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">機能別内訳</h2>
        {metrics.featureBreakdown.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">機能</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">コスト（USD）</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">入力トークン</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">出力トークン</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">セッション数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {metrics.featureBreakdown.map((row) => (
                  <tr key={row.feature} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.feature}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatUsd(row.estimatedUsd)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatTokens(row.inputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatTokens(row.outputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.sessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          ※ interview（本番面接）のコストは未記録のため mock-interview のみ表示
        </p>
      </section>

      {/* ========== 日次トレンド（直近 30 日） ========== */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">日次コスト推移（直近 30 日）</h2>
        {metrics.dailyTrend.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-36 px-4 py-3 text-left font-medium text-gray-600">日付</th>
                  <th className="w-28 px-4 py-3 text-right font-medium text-gray-600">コスト（USD）</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">バー</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {metrics.dailyTrend.map((row) => {
                  const barPct =
                    maxDailyUsd > 0
                      ? Math.round((row.usd / maxDailyUsd) * 100)
                      : 0;
                  return (
                    <tr key={row.day} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-800">{row.day}</td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {formatUsd(row.usd)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========== 候補者別コスト上位 10 名 ========== */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">候補者別コスト上位 10 名</h2>
        {metrics.topCandidates.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">表示名</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">セッション数</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">合計コスト（USD）</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {metrics.topCandidates.map((candidate) => (
                  <tr
                    key={candidate.candidateProfileId}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {candidate.displayName}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {candidate.sessionCount}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatUsd(candidate.totalUsd)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/candidates/${candidate.candidateProfileId}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

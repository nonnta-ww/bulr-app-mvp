'use client';

/**
 * history-section.tsx — 版履歴を統括するコンテナ（Client Component）
 *
 * サーバから渡される版履歴を受け取り、成長推移グラフと版比較を束ねる。
 * - 0件のとき: null を返す（履歴セクション非表示, Req 5.4）
 * - 1件のとき: 推移グラフを単点表示・版比較 UI は非表示（Req 4.4, Req 5.4）
 * - 2件以上のとき: 推移グラフと版比較の双方を表示（Req 5.4）
 *
 * CoverageTrendChart は recharts を使用するため dynamic(ssr:false) でインポートする。
 *
 * Requirements: 4.4, 5.4
 * Boundary: history-section
 * Depends: coverage-trend-chart, version-comparison, _lib/trend
 */

import dynamic from 'next/dynamic';
import type { SelfAnalysisVersion } from '@bulr/db';

import { buildCoverageTrend } from '../_lib/trend';
import { VersionComparison } from './version-comparison';

// ---------------------------------------------------------------------------
// Dynamic import — recharts はクライアント専用のため SSR 無効
// ---------------------------------------------------------------------------

const CoverageTrendChart = dynamic(
  () =>
    import('./coverage-trend-chart').then((m) => m.CoverageTrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400">
        読み込み中…
      </div>
    ),
  },
);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HistorySectionProps {
  /** サーバ側 getSelfAnalysisHistory が返す版配列（昇順） */
  versions: SelfAnalysisVersion[];
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function HistorySection({ versions }: HistorySectionProps) {
  // 0件のときは履歴セクションを非表示（Req 5.4）
  if (versions.length === 0) return null;

  // 推移データを一度だけ計算する（純関数）
  const trend = buildCoverageTrend(versions);

  return (
    <section aria-labelledby="history-section-heading" className="space-y-8">
      <h2
        id="history-section-heading"
        className="text-lg font-semibold text-gray-900"
      >
        成長の推移
      </h2>

      {/* ===== 推移グラフ（1件以上で常に表示） ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <CoverageTrendChart trend={trend} />
        {versions.length === 1 && (
          <p className="mt-3 text-xs text-gray-500">
            版が1件のため推移は単一点です。再回答すると推移が描画されます。
          </p>
        )}
      </div>

      {/* ===== 版比較（2件以上のときのみ表示、Req 5.4） ===== */}
      {versions.length >= 2 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-base font-semibold text-gray-900">
            版の比較
          </h3>
          <VersionComparison versions={versions} />
        </div>
      )}
    </section>
  );
}

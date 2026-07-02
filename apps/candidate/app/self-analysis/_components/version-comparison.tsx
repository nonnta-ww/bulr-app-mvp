'use client';

/**
 * VersionComparison — 2版比較ビュー（Client Component）
 *
 * 履歴の中から2版を選択し、各版の網羅度を左右並置して差分を表示する。
 * - 両版に llmOutput がある場合: 強み・成長アクションを新旧対比表示（Req 5.2）
 * - どちらか一方でも llmOutput === null の場合: 網羅度差分のみ表示（Req 5.3）
 * - versions.length < 2 の場合: null を返す（防御ガード）
 *
 * 数値スコアによる序列化・偏差値・他者比較・順位は一切表示しない（Req 2.3）。
 *
 * Requirements: 5.1, 5.2, 5.3
 * Boundary: version-comparison
 * Depends: compare._lib (diffVersions), coverage-bars, narrative-section
 */

import type { SelfAnalysisVersion } from '@bulr/db';
import { useState } from 'react';

import { diffVersions } from '../_lib/compare';
import { CoverageBars } from './coverage-bars';
import { NarrativeSection } from './narrative-section';

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** 網羅度比率（0..1）をパーセンテージポイント整数に変換 */
function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

/** 版の表示ラベル（例: v2（2024/03/15）） */
function versionLabel(version: SelfAnalysisVersion): string {
  const date = version.submittedAt;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `v${version.versionIndex}（${yyyy}/${mm}/${dd}）`;
}

/** 差分の符号付き文字列（例: +12pt / -8pt / ±0pt） */
function formatDelta(delta: number): string {
  const pts = Math.round(delta * 100);
  if (pts > 0) return `+${pts}pt`;
  if (pts < 0) return `${pts}pt`;
  return '±0pt';
}

/** delta の符号に応じた色クラス */
function deltaColorClass(delta: number): string {
  const pts = Math.round(delta * 100);
  if (pts > 0) return 'text-emerald-600 font-semibold';
  if (pts < 0) return 'text-rose-600 font-semibold';
  return 'text-gray-500';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VersionComparisonProps {
  /** 昇順（古い順）に並んだ全版一覧 */
  versions: SelfAnalysisVersion[];
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function VersionComparison({ versions }: VersionComparisonProps) {
  // 版が2件未満の場合は何も表示しない（防御ガード、Req 5.4 の境界は 5.4 側が持つ）
  if (versions.length < 2) return null;

  const defaultFromId = versions[versions.length - 2]!.responseId;
  const defaultToId = versions[versions.length - 1]!.responseId;

  return (
    <VersionComparisonInner
      versions={versions}
      defaultFromId={defaultFromId}
      defaultToId={defaultToId}
    />
  );
}

// ---------------------------------------------------------------------------
// 内部コンポーネント（useState 使用のため分離）
// ---------------------------------------------------------------------------

interface InnerProps {
  versions: SelfAnalysisVersion[];
  defaultFromId: string;
  defaultToId: string;
}

function VersionComparisonInner({ versions, defaultFromId, defaultToId }: InnerProps) {
  const [fromResponseId, setFromResponseId] = useState<string>(defaultFromId);
  const [toResponseId, setToResponseId] = useState<string>(defaultToId);

  // 選択中の版オブジェクトを解決
  const fromVersion = versions.find((v) => v.responseId === fromResponseId) ?? versions[0]!;
  const toVersion = versions.find((v) => v.responseId === toResponseId) ?? versions[versions.length - 1]!;

  // 網羅度差分を算出（Req 5.1）
  const diff = diffVersions(fromVersion, toVersion);

  // 両版ともに llmOutput があるかどうかで分岐（Req 5.2, 5.3）
  const bothHaveNarrative =
    fromVersion.llmOutput !== null && toVersion.llmOutput !== null;

  return (
    <div className="space-y-8">
      {/* ===== 版選択セクション ===== */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="from-version-select" className="text-xs font-medium text-gray-500">
            比較元（古い版）
          </label>
          <select
            id="from-version-select"
            value={fromResponseId}
            onChange={(e) => setFromResponseId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {versions.map((v) => (
              <option key={v.responseId} value={v.responseId}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end pb-2 text-gray-400" aria-hidden="true">
          →
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="to-version-select" className="text-xs font-medium text-gray-500">
            比較先（新しい版）
          </label>
          <select
            id="to-version-select"
            value={toResponseId}
            onChange={(e) => setToResponseId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {versions.map((v) => (
              <option key={v.responseId} value={v.responseId}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== 網羅度 左右並置（Req 5.1） ===== */}
      <section aria-labelledby="coverage-comparison-heading">
        <h2 id="coverage-comparison-heading" className="mb-4 text-base font-semibold text-gray-900">
          網羅度の比較
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 比較元 */}
          <div>
            <p className="mb-3 text-sm font-medium text-gray-700">
              {versionLabel(fromVersion)}
            </p>
            <CoverageBars snapshot={fromVersion.aggregatedSnapshot} />
          </div>

          {/* 比較先 */}
          <div>
            <p className="mb-3 text-sm font-medium text-gray-700">
              {versionLabel(toVersion)}
            </p>
            <CoverageBars snapshot={toVersion.aggregatedSnapshot} />
          </div>
        </div>
      </section>

      {/* ===== 差分サマリ（Req 5.1） ===== */}
      <section aria-labelledby="delta-summary-heading">
        <h2 id="delta-summary-heading" className="mb-4 text-base font-semibold text-gray-900">
          網羅度の変化
        </h2>

        {/* 全体差分 */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
          <span className="text-sm font-medium text-gray-900">全体の網羅度</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              {toPercent(fromVersion.aggregatedSnapshot.overallCoverageRatio)}%
              {' → '}
              {toPercent(toVersion.aggregatedSnapshot.overallCoverageRatio)}%
            </span>
            <span className={deltaColorClass(diff.overallDelta)}>
              {formatDelta(diff.overallDelta)}
            </span>
          </div>
        </div>

        {/* カテゴリ別差分 */}
        <div className="space-y-2">
          {diff.categories.map((cat) => (
            <div
              key={cat.categoryName}
              className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-4 py-2.5"
            >
              <span className="text-sm text-gray-800">{cat.categoryName}</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">
                  {toPercent(cat.from)}%
                  {' → '}
                  {toPercent(cat.to)}%
                </span>
                <span className={deltaColorClass(cat.delta)}>
                  {formatDelta(cat.delta)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== サマリ比較セクション ===== */}
      {bothHaveNarrative ? (
        /* 両版ともサマリあり → 強み・成長アクションを新旧対比（Req 5.2） */
        <section aria-labelledby="narrative-comparison-heading">
          <h2 id="narrative-comparison-heading" className="mb-4 text-base font-bold text-ink">
            サマリの比較
          </h2>

          {/* 強み 新旧対比 */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-ink">強み</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted">{versionLabel(fromVersion)}</p>
                <NarrativeSection
                  title="強み"
                  items={fromVersion.llmOutput!.strengths}
                  accentBorderClass="border-l-primary"
                  showHeading={false}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted">{versionLabel(toVersion)}</p>
                <NarrativeSection
                  title="強み"
                  items={toVersion.llmOutput!.strengths}
                  accentBorderClass="border-l-primary"
                  showHeading={false}
                />
              </div>
            </div>
          </div>

          {/* 成長アクション 新旧対比 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">成長アクション</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted">{versionLabel(fromVersion)}</p>
                <NarrativeSection
                  title="成長アクション"
                  items={fromVersion.llmOutput!.growthActions}
                  accentBorderClass="border-l-amber"
                  showHeading={false}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted">{versionLabel(toVersion)}</p>
                <NarrativeSection
                  title="成長アクション"
                  items={toVersion.llmOutput!.growthActions}
                  accentBorderClass="border-l-amber"
                  showHeading={false}
                />
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* どちらか一方でも viz_only（llmOutput null）→ 差分のみ（Req 5.3） */
        <p
          role="status"
          className="rounded-card border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-body"
        >
          選択した版のいずれかはサマリ未生成のため、網羅度の差分のみ表示しています。
        </p>
      )}
    </div>
  );
}

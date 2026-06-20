'use client';

/**
 * SelfAnalysisView — 自己分析 表示コンポーネント（Client Component）
 *
 * page.tsx（Server Component）から record と isStale を受け取り、状態別に表示を切り替える。
 *
 * 表示状態の分岐（design.md §表示状態 stateDiagram 準拠）:
 *   - Empty（record === null）:
 *       自己分析未生成。「自己分析を生成する」CTA（generate）を表示（Req 8.2）。
 *   - Complete（record あり & llmOutput あり & !isStale）:
 *       coverage-bars + 強み/弱み/成長アクションを箇条書き表示（Req 3.x）。
 *   - VizOnly（record あり & llmOutput === null）:
 *       coverage-bars + 「サマリ生成に失敗しました」バナー + 「サマリ再生成」CTA（regenerate）（Req 4.1, 4.3）。
 *   - Stale（record あり & llmOutput あり & isStale）:
 *       Complete の表示に加え陳腐化バナー + 「再生成」CTA（generate=全体再生成）（Req 5.2）。
 *
 * 全体失敗（Req 4.2）: GenerateButton 側の GENERATION_FAILED エラーメッセージで
 *   「生成に失敗しました。再度お試しください」を表示し再試行を促す。
 *
 * 数値スコア・他者比較・順位付けは一切含めない（Req 2.3, 3.4）。
 *
 * Requirements: 1.4, 4.1, 4.2, 4.3, 5.2, 8.2
 * Boundary: self-analysis-view
 */

import type { SelfAnalysisRecord } from '@bulr/db';

import { CoverageBars } from './coverage-bars';
import { GenerateButton } from './generate-button';
import { NarrativeSection } from './narrative-section';

// ---------------------------------------------------------------------------
// ボタン配色（テーマトークン非依存）
//
// candidate の globals.css には shadcn の --color-primary 等が未定義のため、
// @bulr/ui Button の default/outline バリアント（bg-primary / bg-background）は
// 背景が描画されずテキストに見える。明示的な Tailwind 配色クラスを className で
// 渡し、cn(tailwind-merge) により variant の配色を上書きして確実にボタンらしく見せる。
// ---------------------------------------------------------------------------

/** 主要ボタン（塗りつぶし） */
const PRIMARY_BTN = 'bg-blue-600 text-white hover:bg-blue-700';
/** 副ボタン（白地・枠線） */
const SECONDARY_BTN =
  'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 hover:text-gray-900';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SelfAnalysisViewProps {
  /** 保存済み自己分析レコード（null = 未生成） */
  record: SelfAnalysisRecord | null;
  /** 最新 skill-survey 回答が record の生成元より新しい場合 true（Req 5.1） */
  isStale: boolean;
  /** 対象アンケートの ID（生成系アクションへ渡す） */
  surveyId: string;
}

// ---------------------------------------------------------------------------
// サブコンポーネント: 陳腐化バナー
// ---------------------------------------------------------------------------

function StaleBanner() {
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <p className="font-medium">回答が更新されています</p>
      <p className="mt-1 text-amber-700">
        最新の skill-survey 回答が自己分析の生成後に更新されています。最新化するには再生成してください。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント: VizOnly バナー（サマリ生成失敗）
// ---------------------------------------------------------------------------

function VizOnlyBanner() {
  return (
    <div
      role="status"
      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      <p className="font-medium">サマリ生成に失敗しました</p>
      <p className="mt-1 text-rose-700">
        可視化データは正常に保存されています。「サマリ再生成」ボタンから自然言語サマリの再生成をお試しください。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function SelfAnalysisView({ record, isStale, surveyId }: SelfAnalysisViewProps) {
  // ---------------------------------------------------------------------------
  // Empty 状態: 自己分析が未生成
  // ---------------------------------------------------------------------------
  if (record === null) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">自己分析を始めましょう</h2>
          <p className="text-sm text-gray-500">
            skill-survey の回答をもとに、強み・弱み・成長アクションを生成します。
            <br />
            ※ 生成には skill-survey への回答が必要です。
          </p>
        </div>
        <GenerateButton
          action="generate"
          label="自己分析を生成する"
          className={`min-w-40 ${PRIMARY_BTN}`}
          surveyId={surveyId}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VizOnly 状態: record あり & llmOutput === null（サマリ生成失敗）
  // ---------------------------------------------------------------------------
  if (record.llmOutput === null) {
    return (
      <div className="space-y-6">
        {/* 可視化は常に表示（Req 4.1） */}
        <CoverageBars snapshot={record.aggregatedSnapshot} />

        {/* 失敗バナー */}
        <VizOnlyBanner />

        {/* サマリ再生成 CTA（Req 4.3） */}
        <div className="flex justify-center">
          <GenerateButton
            action="regenerate"
            label="サマリ再生成"
            variant="outline"
            className={`min-w-36 ${SECONDARY_BTN}`}
            surveyId={surveyId}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Stale 状態: record あり & llmOutput あり & isStale
  // ---------------------------------------------------------------------------
  if (isStale) {
    return (
      <div className="space-y-6">
        {/* 陳腐化バナー（Req 5.2） */}
        <StaleBanner />

        {/* 再生成 CTA（全体再生成 = generate）（Req 5.2） */}
        <div className="flex justify-center">
          <GenerateButton
            action="generate"
            label="最新のスキルアンケートの回答で診断を生成する"
            className={PRIMARY_BTN}
            surveyId={surveyId}
          />
        </div>

        {/* 既存の分析内容（最新でない旨を伝えたうえで表示）（Req 5.3） */}
        <div className="opacity-80">
          <p className="mb-4 text-xs text-gray-500">
            ※ 以下は最後に生成された自己分析です（最新の回答に基づいていない可能性があります）
          </p>
          <CoverageBars snapshot={record.aggregatedSnapshot} />
          <div className="mt-6 space-y-4">
            <NarrativeSection
              title="強み"
              items={record.llmOutput.strengths}
              accentClass="text-emerald-700"
            />
            <NarrativeSection
              title="弱み・手薄な領域"
              items={record.llmOutput.weaknesses}
              accentClass="text-rose-700"
            />
            <NarrativeSection
              title="成長アクション"
              items={record.llmOutput.growthActions}
              accentClass="text-blue-700"
            />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Complete 状態: record あり & llmOutput あり & !isStale（正常表示）
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* 可視化（Req 2.1） */}
      <CoverageBars snapshot={record.aggregatedSnapshot} />

      {/* 自然言語サマリ + 成長アクション（Req 3.1, 3.2） */}
      <div className="space-y-4">
        <NarrativeSection
          title="強み"
          items={record.llmOutput.strengths}
          accentClass="text-emerald-700"
        />
        <NarrativeSection
          title="弱み・手薄な領域"
          items={record.llmOutput.weaknesses}
          accentClass="text-rose-700"
        />
        <NarrativeSection
          title="成長アクション"
          items={record.llmOutput.growthActions}
          accentClass="text-blue-700"
        />
      </div>

      {/* 再診断 CTA（Complete 状態でも提供、Req 5.2）。
          最新のアンケート回答で診断をやり直せることを明示し、塗りつぶしボタンで誘導する。 */}
      <div className="flex flex-col items-stretch gap-2 border-t border-gray-200 pt-6 sm:items-end">
        <p className="text-xs text-gray-500">
          最新のスキルアンケート回答をもとに診断をやり直せます。
        </p>
        <GenerateButton
          action="generate"
          label="最新のスキルアンケートの回答で診断を生成する"
          className={PRIMARY_BTN}
          surveyId={surveyId}
        />
      </div>
    </div>
  );
}

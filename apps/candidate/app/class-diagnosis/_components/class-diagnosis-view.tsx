'use client';

/**
 * ClassDiagnosisView — RPG クラス診断 表示コンポーネント（Client Component, task 8.1）
 *
 * page.tsx（Server Component）から props（record / flavor / hasSkill / hasPlaystyle /
 * isStale）を受け取り、design.md の状態遷移（stateDiagram）に沿って状態別に表示を切り替える。
 *
 * 状態分岐:
 *   - NoVocation（!record && !hasSkill）:
 *       スキル未回答で職掌を判定できない。スキル診断へ誘導する CTA のみ（Req 8.1）。
 *       判定材料が無いため「診断する」生成ボタンは出さない。
 *   - Empty/ready（!record && hasSkill）:
 *       スキル回答済み・診断未生成。「診断する」生成 CTA（generateClassDiagnosis）。
 *       playstyle 未回答なら暫定（partial）結果になる旨を添える。
 *   - PartialNoTemperament（record && result.temperament === null）:
 *       クラスカード（partial）+ 職掌レーダー + 「気質診断に回答」CTA（Req 8.2）+ 再診断。
 *   - Complete（record && temperament && flavor && !isStale）:
 *       クラスカード + 職掌レーダー + 共有パネル + 再診断。
 *   - VizOnly（record && llmFlavor === null）:
 *       Complete と同様だがカードはテンプレート文言でフォールバック（card 側で自動処理, Req 7.3）。
 *       説明文生成失敗の注記 + 再診断。可視化・共有は表示する。
 *   - Stale（record && isStale）:
 *       既存診断を表示しつつ陳腐化バナー（新しい回答があります）+ 再診断 CTA（Req 6.2/6.3）。
 *
 * 数値スコア（ベクトル値・偏差値・順位・他者比較）は一切表示しない（Req 4.4）。
 * 本人所有データのスコープは page.tsx の認証ガードで担保する（Req 11.1）。
 *
 * VocationRadar は recharts を使うため dynamic(ssr:false) で読み込む
 * （self-analysis-view の SkillBalanceRadar と同方針）。
 *
 * Requirements: 4.1, 4.4, 6.2, 6.3, 8.1, 8.2, 11.1
 * Boundary: class-diagnosis-view
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';

import type { ClassResult, ClassFlavor } from '@bulr/types';
import type { ClassDiagnosisRecord } from '@bulr/db';

import { ClassCard } from './class-card';
import { SharePanel } from './share-panel';
import { GenerateButton } from './generate-button';

// ---------------------------------------------------------------------------
// Dynamic import — VocationRadar は recharts を使用するため SSR 無効
// （self-analysis-view の SkillBalanceRadar と同方針）
// ---------------------------------------------------------------------------

const VocationRadar = dynamic(
  () => import('./vocation-radar').then((m) => m.VocationRadar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center rounded-card border border-hairline bg-canvas text-sm text-muted">
        読み込み中…
      </div>
    ),
  },
);

// ---------------------------------------------------------------------------
// ボタン配色（テーマトークン非依存）
//
// candidate の globals.css には shadcn の --color-primary 等が未定義のため、
// @bulr/ui Button の default/outline バリアントは背景が描画されずテキストに見える。
// 明示的な Tailwind 配色クラスを className で渡し、cn(tailwind-merge) により variant の
// 配色を上書きして確実にボタンらしく見せる（self-analysis-view と同じ運用方針）。
// ---------------------------------------------------------------------------

/** 主要ボタン（塗りつぶし・オレンジ） */
const PRIMARY_BTN = 'bg-orange-600 text-white hover:bg-orange-700';
/** 副ボタン（白地・枠線） */
const SECONDARY_BTN =
  'border border-hairline bg-canvas text-gray-800 hover:border-slate hover:bg-orange-50';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClassDiagnosisViewProps {
  /** 保存済みクラス診断レコード（null = 未生成） */
  record: ClassDiagnosisRecord | null;
  /** LLM フレーバー文（null = LLM 未生成/失敗）。card はテンプレートにフォールバックする（Req 7.3） */
  flavor: ClassFlavor | null;
  /** スキル診断に1件以上回答済みなら true（職掌判定の前提, Req 8.1） */
  hasSkill: boolean;
  /** 気質（playstyle）診断に回答済みなら true（未回答なら partial 診断, Req 8.2） */
  hasPlaystyle: boolean;
  /** 最新回答が診断の生成元より新しい（陳腐化）なら true（Req 6.2/6.3） */
  isStale: boolean;
}

// ---------------------------------------------------------------------------
// サブコンポーネント: 陳腐化バナー（Req 6.2/6.3）
// ---------------------------------------------------------------------------

function StaleBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-orange-300 bg-orange-50 px-4 py-3 text-sm"
      data-testid="class-diagnosis-stale-banner"
    >
      <span aria-hidden="true">🔔</span>
      <div>
        <p className="font-medium text-gray-900">新しい回答があります</p>
        <p className="mt-1 text-gray-700">
          診断の生成後にスキル／気質アンケートの回答が更新されています。最新の内容で再診断できます。
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント: VizOnly 注記（説明文生成失敗, Req 7.3）
// ---------------------------------------------------------------------------

function VizOnlyNote() {
  return (
    <p
      role="status"
      className="rounded-card border border-hairline bg-canvas px-3 py-2 text-xs text-muted"
      data-testid="class-diagnosis-vizonly-note"
    >
      説明文の生成に失敗したため、テンプレートの説明を表示しています。再診断で生成をやり直せます。
    </p>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント: 可視化ブロック（クラスカード + 職掌レーダー）
// ---------------------------------------------------------------------------

function DiagnosisVisualization({
  result,
  flavor,
}: {
  result: ClassResult;
  flavor: ClassFlavor | null;
}) {
  return (
    <div className="space-y-6">
      <ClassCard result={result} flavor={flavor} />
      <div className="rounded-card border border-hairline bg-canvas p-6">
        <h3 className="mb-4 text-base font-bold text-gray-900">職掌バランス</h3>
        <VocationRadar vocationVector={result.vocationVector} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function ClassDiagnosisView({
  record,
  flavor,
  hasSkill,
  hasPlaystyle,
  isStale,
}: ClassDiagnosisViewProps) {
  // -------------------------------------------------------------------------
  // NoVocation: 診断もスキル回答もない（判定材料なし）（Req 8.1）
  // -------------------------------------------------------------------------
  if (!record && !hasSkill) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-gray-900">まずはスキル診断から</h2>
          <p className="text-sm text-gray-700">
            クラスを判定するには、スキルアンケートへの回答が必要です。
            <br />
            スキル診断に回答して職掌を解放しましょう。
          </p>
        </div>
        <Link
          href="/skill-survey"
          className={`inline-flex min-w-56 items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium ${PRIMARY_BTN}`}
          data-testid="class-diagnosis-skill-cta"
        >
          スキル診断に回答して職掌を解放する
        </Link>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Empty/ready: スキル回答済み・診断未生成（Req 8.1）
  // -------------------------------------------------------------------------
  if (!record) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-gray-900">クラス診断を始めましょう</h2>
          <p className="text-sm text-gray-700">
            これまでのスキルアンケート回答をもとに、あなたのWebエンジニアクラスを判定します。
          </p>
          {!hasPlaystyle ? (
            <p className="text-xs text-muted" data-testid="class-diagnosis-partial-note">
              ※ 気質診断が未回答のため、まずは暫定（職掌のみ）の結果になります。
            </p>
          ) : null}
        </div>
        <GenerateButton label="診断する" className={`min-w-40 ${PRIMARY_BTN}`} />
      </div>
    );
  }

  // ここから record は非 null。
  const result = record.result;
  const isPartial = result.temperament === null;
  const isVizOnly = record.llmFlavor === null;

  // -------------------------------------------------------------------------
  // Stale: 既存診断 + 陳腐化バナー + 再診断（Req 6.2/6.3）
  //   （partial/complete/vizOnly を問わず、陳腐化を最優先で伝える）
  // -------------------------------------------------------------------------
  if (isStale) {
    return (
      <div className="space-y-6">
        <StaleBanner />

        <div className="flex justify-center">
          <GenerateButton label="最新の回答で再診断する" className={PRIMARY_BTN} />
        </div>

        <div className="opacity-80">
          <p className="mb-4 text-xs text-muted">
            ※ 以下は最後に生成された診断です（最新の回答に基づいていない可能性があります）。
          </p>
          <DiagnosisVisualization result={result} flavor={flavor} />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // PartialNoTemperament: 気質未回答（temperament=null）（Req 8.2）
  // -------------------------------------------------------------------------
  if (isPartial) {
    return (
      <div className="space-y-6">
        <DiagnosisVisualization result={result} flavor={flavor} />

        {isVizOnly ? <VizOnlyNote /> : null}

        <div className="flex flex-col items-stretch gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-sm text-gray-700">
              気質診断に回答すると、クラスがより具体的に確定します。
            </p>
            <Link
              href="/skill-survey"
              className={`inline-flex min-w-56 items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium ${PRIMARY_BTN}`}
              data-testid="class-diagnosis-temperament-cta"
            >
              気質診断に回答して完全な結果にする
            </Link>
          </div>
          <GenerateButton label="再診断する" className={SECONDARY_BTN} />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Complete / VizOnly: 確定診断（temperament あり）（Req 4.1）
  //   VizOnly（llmFlavor=null）は card がテンプレートにフォールバックし、注記を添える（Req 7.3）。
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <DiagnosisVisualization result={result} flavor={flavor} />

      {isVizOnly ? <VizOnlyNote /> : null}

      <SharePanel result={result} />

      <div className="flex flex-col items-stretch gap-2 border-t border-hairline pt-6 sm:items-end">
        <p className="text-xs text-muted">
          最新のアンケート回答をもとに診断をやり直せます。
        </p>
        <GenerateButton label="再診断する" className={SECONDARY_BTN} />
      </div>
    </div>
  );
}

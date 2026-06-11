'use client';

/**
 * SidePanel — 操作レス面接サイドパネル
 *
 * 責務:
 *  - パターンカバレッジ進捗（カバー済み/進行中/未着手）と到達段階の表示（Req 3.1）
 *  - 次の質問候補 3 件の読み取り専用表示（Req 3.2、操作レス）
 *  - 経過時間（mm:ss）と残り計画パターン数の表示（Req 3.8）
 *  - 解析上限到達通知（Req 4.5）
 *
 * # Props 設計（props-driven / propsドリブン）
 *
 * - 状態はすべて親（LiveCaptureRunner / use-live-state）から渡す。
 *   ポーリングや内部タイマーを一切持たない。
 *   → Req 8.2 の「DB 真実源 / クライアントに進行状態を持たない」方針を構造で保証。
 *
 * # 操作レス設計
 *
 * - SidePanel 内にボタン・インタラクティブ要素は一切存在しない（Req 3.5）。
 *   開始・終了・中止の 3 操作は LiveCaptureRunner（親コンポーネント）が担う。
 *   agenda コンポーネント（session-agenda-sidebar / agenda-pattern-row / next-question-picker）の
 *   視覚表現を参考にしつつ、選択・クリックの UI はすべて省いて流用している。
 *
 * # Agenda コンポーネントとの関係
 *
 * - session-agenda-sidebar: 幅リサイズ・折りたたみ・onItemClick は除去。パターン一覧の
 *   グループ表示スタイル（タイトル + ステータス行）を参考に構築。
 * - agenda-pattern-row: role="button" / onClick / onKeyDown は除去。ステータスチップの
 *   カラーパレット（green/blue/gray）を踏襲。
 * - next-question-picker: CandidateRow の intent バッジスタイルと候補テキスト表示を参考に
 *   構築。選択ボタン・録音開始ボタン・切替リンクはすべて省いた読み取り専用版。
 *
 * Requirements: 3.1, 3.2, 3.5, 3.8, 4.5
 * Design: LiveCaptureRunner / … / SidePanel (Components and Interfaces),
 *         Requirements Traceability 行 3.1/3.2/3.8/4.5, LiveStateAPI
 */

import type { PatternCoverageSummary, ProposalView } from '../../../../../lib/capture/live-state';

// ---------------------------------------------------------------------------
// ロケール定数（アプリ別文面 — 設計方針: コピーは app 側に持つ）
// ---------------------------------------------------------------------------

/** カバレッジステータス → 表示ラベル（Req 3.1） */
const COVERAGE_STATUS_LABELS: Record<PatternCoverageSummary['status'], string> = {
  covered: 'カバー済み',
  in_progress: '進行中',
  not_started: '未着手',
} as const;

/** カバレッジステータス → バッジ CSS クラス（agenda-pattern-row のカラーパレット踏襲） */
const COVERAGE_STATUS_BADGE_CLASSES: Record<PatternCoverageSummary['status'], string> = {
  covered: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  not_started: 'bg-gray-100 text-gray-600',
} as const;

/** 候補 intent → 表示ラベル（next-question-picker の intentLabel と同一） */
const INTENT_LABELS: Record<string, string> = {
  deep_dive: '深掘り',
  meta_cognition: 'メタ認知',
  next_pattern: '次パターン',
} as const;

/** 候補 intent → バッジ CSS クラス（next-question-picker の intentBadge と同一） */
const INTENT_BADGE_CLASSES: Record<string, string> = {
  deep_dive: 'bg-violet-100 text-violet-800',
  meta_cognition: 'bg-pink-100 text-pink-800',
  next_pattern: 'bg-blue-100 text-blue-800',
} as const;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * 秒数を "mm:ss" 形式の文字列にフォーマットする（Req 3.8）。
 * 例: 0 → "00:00", 125 → "02:05", 3661 → "61:01"
 */
function formatElapsedTime(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Props 型
// ---------------------------------------------------------------------------

export interface SidePanelProps {
  /**
   * 計画パターンのカバレッジサマリ（Req 3.1）。
   * live-state の coverage フィールドをそのまま渡す。
   */
  coverage: PatternCoverageSummary[];

  /**
   * 最新の質問候補 3 件（Req 3.2）。
   * live-state の currentProposal フィールドをそのまま渡す。
   * null の場合は「準備中」状態を表示する。
   */
  currentProposal: ProposalView | null;

  /**
   * セッション開始からの経過秒数（Req 3.8）。
   * live-state の elapsedSeconds フィールドをそのまま渡す。
   */
  elapsedSeconds: number;

  /**
   * 未消化の計画パターン数（Req 3.8）。
   * live-state の remainingPlannedPatterns フィールドをそのまま渡す。
   */
  remainingPlannedPatterns: number;

  /**
   * 自動解析の上限に達しているかどうか（Req 4.5）。
   * live-state の analysisCapped フィールドをそのまま渡す。
   * true の場合に解析上限通知を表示する。
   */
  analysisCapped: boolean;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * SidePanel
 *
 * 操作不要のサイドパネル。面接官は見たいときだけ見る読み取り専用表示。
 * 'use client' だがクライアント進行状態は一切持たない（8.2 の方針継承）。
 */
export function SidePanel({
  coverage,
  currentProposal,
  elapsedSeconds,
  remainingPlannedPatterns,
  analysisCapped,
}: SidePanelProps) {
  return (
    <aside className="side-panel flex flex-col gap-4 p-3" aria-label="面接サイドパネル">

      {/* ── ヘッダー：経過時間・残りパターン数（Req 3.8） ─────────────────── */}
      <div className="side-panel__header flex items-center justify-between text-sm text-gray-600">
        <span className="side-panel__elapsed font-mono" aria-label="経過時間">
          {formatElapsedTime(elapsedSeconds)}
        </span>
        <span
          className="side-panel__remaining text-xs text-gray-500"
          data-testid="remaining-patterns"
          aria-label="残り計画パターン数"
        >
          残り {remainingPlannedPatterns} パターン
        </span>
      </div>

      {/* ── 解析上限到達通知（Req 4.5） ───────────────────────────────────── */}
      {analysisCapped && (
        <div
          role="status"
          className="side-panel__analysis-cap-notice rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          解析上限に達しました。録音・転写は継続、解析は停止しています。
        </div>
      )}

      {/* ── カバレッジ進捗（Req 3.1） ────────────────────────────────────── */}
      <section className="side-panel__coverage" aria-label="カバレッジ進捗">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          パターン消化状況
        </h4>
        <ul
          className="side-panel__coverage-list flex flex-col gap-1"
          aria-label="パターン一覧"
        >
          {coverage.map((item) => (
            <li
              key={item.patternCode}
              className="side-panel__coverage-item flex items-center justify-between text-xs"
            >
              {/* パターンコード */}
              <span className="side-panel__pattern-code text-gray-700">
                {item.patternCode}
              </span>

              {/* ステータスチップ + 到達段階 */}
              <div className="flex items-center gap-1">
                <span
                  className={[
                    'side-panel__coverage-status rounded-full px-2 py-0.5 text-[10px] font-medium',
                    COVERAGE_STATUS_BADGE_CLASSES[item.status],
                  ].join(' ')}
                >
                  {COVERAGE_STATUS_LABELS[item.status]}
                </span>

                {/* 到達段階（Req 3.1: covered / in_progress のとき非 null） */}
                {item.levelReached !== null && (
                  <span className="side-panel__level-reached text-[10px] text-gray-500">
                    段階{item.levelReached}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 質問候補（読み取り専用・操作レス）（Req 3.2） ────────────────── */}
      <section
        className="side-panel__proposals"
        aria-label="次の質問候補"
        data-testid="proposal-section"
      >
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          次の質問候補
        </h4>

        {currentProposal === null ? (
          /* currentProposal が null の場合: 準備中状態（Req 3.2） */
          <p className="side-panel__proposals-empty text-xs text-gray-400">
            準備中...
          </p>
        ) : (
          /* 候補 3 件の読み取り専用一覧 — ボタン・選択操作は一切含まない（Req 3.5） */
          <ol
            className="side-panel__proposals-list flex flex-col gap-2"
            aria-label="候補一覧"
          >
            {currentProposal.candidates.map((candidate, idx) => {
              const intentLabel = INTENT_LABELS[candidate.intent] ?? candidate.intent;
              const intentBadgeClass =
                INTENT_BADGE_CLASSES[candidate.intent] ?? 'bg-gray-100 text-gray-800';
              return (
                <li
                  key={idx}
                  className="side-panel__proposal-item rounded border border-gray-200 bg-white p-2 text-xs leading-relaxed"
                >
                  {/* Intent バッジ（next-question-picker の CandidateRow スタイル踏襲、選択機能なし） */}
                  <span
                    className={[
                      'mb-1 inline-block rounded-full px-2 py-0.5 text-[10px]',
                      intentBadgeClass,
                    ].join(' ')}
                  >
                    {intentLabel}
                  </span>

                  {/* 候補テキスト（読み取り専用） */}
                  <p className="side-panel__proposal-text mt-0.5">
                    {candidate.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}

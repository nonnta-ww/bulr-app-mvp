'use client';
/**
 * LiveCaptureRunner — ライブキャプチャ画面のシェルコンポーネント
 *
 * 設計方針（design.md: LiveCaptureRunner / CaptureStartPanel / LiveTranscriptPane / SidePanel）:
 * - 進行状態を一切クライアントに保持しない。描画は useLiveState の返却値のみに依存する（Req 8.2）。
 *   → useReducer による進行ステートマシンは持たない。この設計が 8.2 の構造的保証となる。
 * - 操作要素は「キャプチャ開始」「面接終了」「中止」の 3 種のみ（Req 3.5）。
 *
 * 子パネル（task 5.2〜5.4 で実装済み）:
 *  - CaptureStartPanel: 会議 URL 入力 / 対面切替 / 失敗リトライ（5.2）
 *  - LiveTranscriptPane: 話者ラベル付きトランスクリプト表示（5.3）
 *  - SidePanel: カバレッジ進捗 + 質問候補（5.4）
 *
 * Requirements: 3.5, 6.1, 8.2
 * Design: LiveCaptureRunner / CaptureStartPanel / LiveTranscriptPane / SidePanel
 */

import { startCapture as defaultStartCapture } from '../../[sessionId]/_actions/start-capture';
import { stopCapture as defaultStopCapture } from '../../[sessionId]/_actions/stop-capture';
import { useLiveState } from './use-live-state';
import { CaptureStartPanel } from './capture-start-panel';
import { LiveTranscriptPane } from './live-transcript-pane';
import { SidePanel } from './side-panel';
import type { LiveState } from '../../../../../lib/capture/live-state';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type StartCaptureMode =
  | { kind: 'recall'; meetingUrl: string }
  | { kind: 'mic' };

type StartCaptureInput = { sessionId: string; mode: StartCaptureMode };
type StopCaptureInput = { sessionId: string; reason: 'finish' | 'abort' };

export interface LiveCaptureRunnerProps {
  sessionId: string;
  /**
   * 同意取得済みフラグ（Req 1.6）。
   * ページ（Server Component）から session.consent_obtained_at !== null を渡す。
   * CaptureStartPanel に委譲して開始ボタンの有効/無効を制御する。
   */
  consentObtained: boolean;
  /**
   * 前回試行した会議 URL の初期値（CaptureStartPanel の lastMeetingUrl に渡す）。
   * ページから session.meeting_url を渡す。
   */
  initialMeetingUrl?: string | null;
  /**
   * startCapture Server Action。
   * 本番では import デフォルト値を使用。テストでは mock を注入する。
   */
  startCapture?: (input: StartCaptureInput) => Promise<unknown>;
  /**
   * stopCapture Server Action。
   * 本番では import デフォルト値を使用。テストでは mock を注入する。
   */
  stopCapture?: (input: StopCaptureInput) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// キャプチャ状態の分類ヘルパー
// ---------------------------------------------------------------------------

/** キャプチャ開始パネル（CaptureStartPanel）を表示する状態 */
function isIdleState(status: LiveState['captureStatus']): boolean {
  return status === 'idle' || status === 'failed';
}

/** ライブエリア（LiveTranscriptPane + SidePanel）を表示するアクティブ状態 */
function isActiveState(status: LiveState['captureStatus']): boolean {
  return (
    status === 'bot_joining' ||
    status === 'recording' ||
    status === 'stopping'
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * LiveCaptureRunner
 *
 * useLiveState の取得結果のみで描画する（クライアント進行状態を持たない = Req 8.2）。
 * 操作要素は「キャプチャ開始」「面接終了」「中止」の 3 種のみ（Req 3.5）。
 *
 * 状態別 UI:
 *  - idle / failed: CaptureStartPanel（会議 URL 入力 / 対面切替 / 失敗リトライ）
 *  - bot_joining / recording / stopping: LiveTranscriptPane + SidePanel + 面接終了・中止ボタン
 *  - stopped / aborted: 終了後の静的表示（操作ボタンなし）
 */
export function LiveCaptureRunner({
  sessionId,
  consentObtained,
  initialMeetingUrl,
  startCapture = defaultStartCapture as (input: StartCaptureInput) => Promise<unknown>,
  stopCapture = defaultStopCapture as (input: StopCaptureInput) => Promise<unknown>,
}: LiveCaptureRunnerProps) {
  // Req 8.2: useLiveState の返却値のみで描画。useReducer 進行ステートマシンは持たない。
  const liveState = useLiveState(sessionId);
  const {
    captureStatus,
    segments,
    staleTranscript,
    analysisCapped,
    coverage,
    currentProposal,
    elapsedSeconds,
    remainingPlannedPatterns,
  } = liveState;

  // -------------------------------------------------------------------------
  // ハンドラ
  // -------------------------------------------------------------------------

  /** recall モードでキャプチャ開始（会議 URL 指定、CaptureStartPanel から呼ばれる） */
  async function handleStartRecall(meetingUrl: string) {
    await startCapture({ sessionId, mode: { kind: 'recall', meetingUrl } });
  }

  /** mic モードでキャプチャ開始（対面録音、CaptureStartPanel から呼ばれる） */
  async function handleStartMic() {
    await startCapture({ sessionId, mode: { kind: 'mic' } });
  }

  /** 面接終了（Req 3.5 制御要素 2/3） */
  async function handleFinish() {
    await stopCapture({ sessionId, reason: 'finish' });
  }

  /** 中止（Req 3.5 制御要素 3/3） */
  async function handleAbort() {
    await stopCapture({ sessionId, reason: 'abort' });
  }

  // -------------------------------------------------------------------------
  // レンダリング: idle / failed → CaptureStartPanel（Req 1.4, 1.5, 1.6, 6.1）
  // -------------------------------------------------------------------------

  if (isIdleState(captureStatus)) {
    return (
      <div className="live-capture-runner py-6" data-capture-status={captureStatus}>
        <div className="mx-auto max-w-xl">
          {/* Req 3.5 制御要素 1/3: キャプチャ開始（CaptureStartPanel が recall / mic を提供） */}
          <CaptureStartPanel
            consentObtained={consentObtained}
            captureStatus={captureStatus as 'idle' | 'failed'}
            onStartRecall={handleStartRecall}
            onStartMic={handleStartMic}
            lastMeetingUrl={initialMeetingUrl ?? undefined}
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // レンダリング: アクティブ状態 → ライブエリア（LiveTranscriptPane + SidePanel）
  // -------------------------------------------------------------------------

  if (isActiveState(captureStatus)) {
    return (
      <div className="live-capture-runner p-4" data-capture-status={captureStatus}>
        {/* ライブコンテンツ: 転写ペイン（左） + サイドパネル（右） */}
        <div className="live-capture-runner__content flex gap-4">
          {/* LiveTranscriptPane: 話者ラベル付きセグメント表示 + 遅延通知（Req 2.1, 2.2, 2.3, 2.5） */}
          <div className="min-w-0 flex-1">
            <LiveTranscriptPane
              segments={segments}
              staleTranscript={staleTranscript}
            />
          </div>

          {/* SidePanel: カバレッジ進捗 + 質問候補 + 経過時間 + 解析上限通知（Req 3.1, 3.2, 3.8, 4.5） */}
          <div className="w-80 shrink-0">
            <SidePanel
              coverage={coverage}
              currentProposal={currentProposal}
              elapsedSeconds={elapsedSeconds}
              remainingPlannedPatterns={remainingPlannedPatterns}
              analysisCapped={analysisCapped}
            />
          </div>
        </div>

        {/* Req 3.5 制御要素 2/3・3/3: 面接終了・中止 */}
        <div className="capture-controls mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleFinish}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            面接終了
          </button>
          <button
            type="button"
            onClick={handleAbort}
            className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            中止
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // レンダリング: stopped / aborted → 終了後の静的表示（操作ボタンなし）
  // -------------------------------------------------------------------------

  return (
    <div className="live-capture-runner" data-capture-status={captureStatus}>
      <p>
        {captureStatus === 'stopped' && '面接が終了しました。'}
        {captureStatus === 'aborted' && 'キャプチャを中止しました。'}
      </p>
    </div>
  );
}

'use client';
/**
 * LiveCaptureRunner — ライブキャプチャ画面のシェルコンポーネント
 *
 * 設計方針（design.md: LiveCaptureRunner / CaptureStartPanel / LiveTranscriptPane / SidePanel）:
 * - 進行状態を一切クライアントに保持しない。描画は useLiveState の返却値のみに依存する（Req 8.2）。
 *   → useReducer による進行ステートマシンは持たない。この設計が 8.2 の構造的保証となる。
 * - 操作要素は「キャプチャ開始」「面接終了」「中止」の 3 つのみ（Req 3.5）。
 *
 * 子パネルのスロット（5.2〜5.4 で実装予定）:
 *  - START_PANEL_PLACEHOLDER: 5.2 CaptureStartPanel（会議URL入力 / 対面切替 / 失敗リトライ）
 *  - TRANSCRIPT_PANE_PLACEHOLDER: 5.3 LiveTranscriptPane（話者ラベル付きトランスクリプト表示）
 *  - SIDE_PANEL_PLACEHOLDER: 5.4 SidePanel（カバレッジ進捗 + 質問候補）
 *
 * Requirements: 3.5, 8.2
 * Design: LiveCaptureRunner / CaptureStartPanel / LiveTranscriptPane / SidePanel
 */

import { startCapture as defaultStartCapture } from '../../[sessionId]/_actions/start-capture';
import { stopCapture as defaultStopCapture } from '../../[sessionId]/_actions/stop-capture';
import { useLiveState } from './use-live-state';
import type { LiveState, LiveSegment } from '../../../../../lib/capture/live-state';

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
   * startCapture Server Action。
   * 本番では import デフォルト値を使用。テストでは mock を注入する。
   * CaptureStartPanel（task 5.2）が詳細な mode 選択 UI を提供する。
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

/** キャプチャ開始ボタンを表示する状態 */
function isIdleState(status: LiveState['captureStatus']): boolean {
  return status === 'idle' || status === 'failed';
}

/** 面接終了・中止ボタンを表示するアクティブ状態 */
function isActiveState(status: LiveState['captureStatus']): boolean {
  return (
    status === 'bot_joining' ||
    status === 'recording' ||
    status === 'stopping'
  );
}

// ---------------------------------------------------------------------------
// セグメントインラインレンダラ（task 5.3 LiveTranscriptPane が置き換える）
// ---------------------------------------------------------------------------

/** @todo task 5.3: LiveTranscriptPane でこのプレースホルダを置き換える */
function SegmentsPlaceholder({ segments }: { segments: LiveSegment[] }) {
  if (segments.length === 0) return null;
  return (
    <ul aria-label="transcript-segments" className="live-transcript-placeholder">
      {segments.map((seg) => (
        <li key={seg.seq} data-seq={seg.seq} data-speaker={seg.speakerRole}>
          <span className="speaker-label">{seg.speakerLabel ?? seg.speakerRole}</span>
          <span className="segment-text">{seg.text}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * LiveCaptureRunner
 *
 * useLiveState の取得結果のみで描画する（クライアント進行状態を持たない = Req 8.2）。
 * 操作要素は「キャプチャ開始」「面接終了」「中止」の 3 つのみ（Req 3.5）。
 *
 * 状態別 UI:
 *  - idle / failed: 開始パネルエリア + キャプチャ開始ボタン
 *    → task 5.2 CaptureStartPanel が START_PANEL_PLACEHOLDER を置き換える
 *  - bot_joining / recording / stopping: ライブエリア + 面接終了・中止ボタン
 *    → task 5.3 LiveTranscriptPane が TRANSCRIPT_PANE_PLACEHOLDER を置き換える
 *    → task 5.4 SidePanel が SIDE_PANEL_PLACEHOLDER を置き換える
 *  - stopped / aborted: 終了後の静的表示（操作ボタンなし）
 */
export function LiveCaptureRunner({
  sessionId,
  startCapture = defaultStartCapture as (input: StartCaptureInput) => Promise<unknown>,
  stopCapture = defaultStopCapture as (input: StopCaptureInput) => Promise<unknown>,
}: LiveCaptureRunnerProps) {
  // Req 8.2: useLiveState の返却値のみで描画。useReducer 進行ステートマシンは持たない。
  const liveState = useLiveState(sessionId);
  const { captureStatus, segments, staleTranscript, analysisCapped, elapsedSeconds, remainingPlannedPatterns } = liveState;

  // -------------------------------------------------------------------------
  // ハンドラ
  // -------------------------------------------------------------------------

  async function handleStart() {
    // TODO(task 5.2): CaptureStartPanel が会議URL入力・対面切替を提供する。
    // 現フェーズではマイクモードをデフォルトとするシェル実装。
    await startCapture({ sessionId, mode: { kind: 'mic' } });
  }

  async function handleFinish() {
    await stopCapture({ sessionId, reason: 'finish' });
  }

  async function handleAbort() {
    await stopCapture({ sessionId, reason: 'abort' });
  }

  // -------------------------------------------------------------------------
  // レンダリング: idle / failed → 開始パネルエリア
  // -------------------------------------------------------------------------

  if (isIdleState(captureStatus)) {
    return (
      <div className="live-capture-runner" data-capture-status={captureStatus}>
        {/* START_PANEL_PLACEHOLDER: task 5.2 CaptureStartPanel がここを置き換える */}
        {/* 現フェーズ: 最小限の開始パネル */}
        <div className="capture-start-panel-placeholder">
          {captureStatus === 'failed' && (
            <p role="alert">キャプチャの開始に失敗しました。再試行してください。</p>
          )}
          {/* Req 3.5 制御要素 1/3: キャプチャ開始 */}
          <button type="button" onClick={handleStart}>
            キャプチャ開始
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // レンダリング: アクティブ状態 → ライブエリア（転写ペイン + サイドパネル）
  // -------------------------------------------------------------------------

  if (isActiveState(captureStatus)) {
    return (
      <div className="live-capture-runner" data-capture-status={captureStatus}>
        {/* 警告バナー */}
        {staleTranscript && (
          <div role="alert" className="stale-transcript-warning">
            転写が遅延しています
          </div>
        )}
        {analysisCapped && (
          <div role="status" className="analysis-capped-notice">
            自動解析の上限に達しました。録音と文字起こしは継続中です。
          </div>
        )}

        {/* 経過時間・残りパターン数 (Req 3.8) */}
        <div className="elapsed-info">
          <span className="elapsed-seconds">経過: {elapsedSeconds}秒</span>
          <span className="remaining-patterns">残りパターン: {remainingPlannedPatterns}</span>
        </div>

        {/* TRANSCRIPT_PANE_PLACEHOLDER: task 5.3 LiveTranscriptPane がここを置き換える */}
        {/* 現フェーズ: セグメントのインラインリスト */}
        <SegmentsPlaceholder segments={segments} />

        {/* SIDE_PANEL_PLACEHOLDER: task 5.4 SidePanel がここを置き換える */}
        {/* 現フェーズ: サイドパネルは非実装 */}

        {/* Req 3.5 制御要素 2/3・3/3: 面接終了・中止 */}
        <div className="capture-controls">
          <button type="button" onClick={handleFinish}>
            面接終了
          </button>
          <button type="button" onClick={handleAbort}>
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

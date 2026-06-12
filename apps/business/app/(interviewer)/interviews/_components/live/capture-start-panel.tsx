'use client';

/**
 * CaptureStartPanel — キャプチャ開始パネル（プレゼンテーションコンポーネント）
 *
 * 責務:
 *  - 会議 URL 入力フォーム（Zoom / Google Meet / Microsoft Teams の形式エラー表示）— Req 1.1, 1.2
 *  - ボット参加失敗時の理由表示 + 再試行 / 対面切替ボタン — Req 1.4
 *  - 同意未記録エラー表示と開始ブロック — Req 1.6
 *  - 対面録音で開始（マイクモード）の主要パス — Req 1.5
 *
 * # クライアント・サーバー検証の分離
 *
 * このコンポーネントは `meeting-url-client.ts` の `isValidMeetingUrl` で
 * クライアントサイドの入力フォーマット検証を行う（UX フィードバック専用）。
 * URL 検証の **真実源はサーバーアクション `startCapture` の meetingUrlSchema（Zod）** であり、
 * このコンポーネントの検証はあくまで即時フィードバックのためのものである。
 * クライアント検証を通過した URL でも、サーバー側で再検証・認可が行われる。
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6
 * Design: LiveCaptureRunner / CaptureStartPanel / "Error Handling"（ボット参加失敗）
 *         / Requirements Traceability 行 1.1, 1.2, 1.4, 1.6
 */

import { useState } from 'react';
import { isValidMeetingUrl } from './meeting-url-client';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * ボット参加失敗の理由コード。
 * design.md Error Strategy より:
 *   invalid_meeting_url → URL 修正促し
 *   join_failed         → 会議ホストへの案内
 *   timeout             → 再試行または対面切替
 */
type JoinFailureCode = 'invalid_meeting_url' | 'join_failed' | 'timeout' | string;

export interface CaptureStartPanelProps {
  /**
   * recall モードで会議に参加する。
   * フォーム検証通過後または再試行ボタン押下時に meetingUrl を引数として呼ぶ。
   */
  onStartRecall: (meetingUrl: string) => void | Promise<void>;

  /**
   * 対面録音モードで開始する。
   * 主要「対面録音で開始」ボタンと、失敗時「対面録音に切替」ボタンの両方から呼ばれる。
   */
  onStartMic: () => void | Promise<void>;

  /**
   * 同意取得済みフラグ（Req 1.6）。
   * false の場合は同意エラーを表示し、すべてのアクションボタンを disabled にする。
   */
  consentObtained: boolean;

  /**
   * 現在の capture_status（idle | failed）。
   * failed の場合は joinFailureCode に基づく理由を表示し、再試行 / 対面切替を提示する。
   */
  captureStatus: 'idle' | 'failed';

  /**
   * ボット参加失敗の理由コード（captureStatus='failed' 時に使用）。
   * undefined の場合は失敗セクション自体を非表示にする。
   */
  joinFailureCode?: JoinFailureCode;

  /**
   * 前回試行した会議 URL（captureStatus='failed' 時に URL 入力欄を初期値で埋める）。
   * 再試行ボタンを押した際にこの値が onStartRecall に渡される。
   */
  lastMeetingUrl?: string;
}

// ---------------------------------------------------------------------------
// ロケール文字列（アプリ別文面 — 設計方針: コピーは app 側に持つ）
// ---------------------------------------------------------------------------

/** ボット参加失敗コードごとの日本語説明（Req 1.4 / design.md Error Strategy）。 */
const JOIN_FAILURE_MESSAGES: Record<string, string> = {
  invalid_meeting_url:
    '会議 URL が無効です。URL を確認して再入力してください。',
  join_failed:
    '録音ボットが会議への入室を拒否されました。会議ホストに参加を許可してもらってください。',
  timeout:
    '録音ボットの参加がタイムアウトしました。会議が開始されているか確認してください。',
};

function getJoinFailureMessage(code: JoinFailureCode): string {
  return (
    JOIN_FAILURE_MESSAGES[code] ?? '録音ボットが会議に参加できませんでした。'
  );
}

/** URL フォーマットエラー文言 — 3 サービス名を明示する（Req 1.2）。 */
const URL_FORMAT_ERROR =
  'URL の形式が正しくありません。Zoom / Google Meet / Microsoft Teams の会議 URL を入力してください。';

/** 同意未記録エラー文言（Req 1.6）。 */
const CONSENT_ERROR =
  '同意の記録がありません。キャプチャを開始する前に候補者の同意を記録してください。';

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * CaptureStartPanel
 *
 * 状態はすべて親から Props として受け取る（プレゼンテーション専用）。
 * コンポーネント内部の状態は「会議 URL 入力値」と「URL フォーマットエラー」のみ。
 */
export function CaptureStartPanel({
  onStartRecall,
  onStartMic,
  consentObtained,
  captureStatus,
  joinFailureCode,
  lastMeetingUrl,
}: CaptureStartPanelProps) {
  // URL 入力値: lastMeetingUrl（再試行時の初期値）があれば使用
  const [meetingUrl, setMeetingUrl] = useState<string>(lastMeetingUrl ?? '');
  // クライアントサイドの URL フォーマットエラー（UX フィードバック専用）
  const [urlFormatError, setUrlFormatError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // ハンドラ
  // -------------------------------------------------------------------------

  /** フォーム送信：クライアント URL バリデーション → onStartRecall 呼び出し */
  function handleRecallSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();

    // 同意チェック（disabled ボタンのためここには通常到達しないが防衛コード）
    if (!consentObtained) return;

    // クライアントサイド URL 検証（UX フィードバック専用 — サーバーが真実源）
    if (!isValidMeetingUrl(meetingUrl)) {
      setUrlFormatError(URL_FORMAT_ERROR);
      return;
    }

    setUrlFormatError(null);
    void onStartRecall(meetingUrl);
  }

  /** 再試行ボタン：現在の URL 入力値（lastMeetingUrl で初期化済み）で recall を再試行 */
  function handleRetry(): void {
    void onStartRecall(meetingUrl);
  }

  /** 対面録音モードで開始 */
  function handleMicStart(): void {
    void onStartMic();
  }

  // -------------------------------------------------------------------------
  // レンダリング
  // -------------------------------------------------------------------------

  return (
    <section
      className="capture-start-panel flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-label="キャプチャ開始"
    >
      {/* ── 同意未記録エラー（Req 1.6） ─────────────────────────────────── */}
      {!consentObtained && (
        <div
          role="alert"
          className="consent-error rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {CONSENT_ERROR}
        </div>
      )}

      {/* ── ボット参加失敗エラー（Req 1.4） ──────────────────────────────── */}
      {captureStatus === 'failed' && joinFailureCode !== undefined && (
        <div
          role="alert"
          className="join-failure-error rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="join-failure-message mb-2">
            {getJoinFailureMessage(joinFailureCode)}
          </p>
          <div className="join-failure-actions flex gap-2">
            {/* 再試行: 現在の URL で recall を再試行する */}
            <button
              type="button"
              onClick={handleRetry}
              disabled={!consentObtained}
              className="retry-button inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              再試行
            </button>
            {/* 対面切替: マイクモードに切り替えてキャプチャ継続 */}
            <button
              type="button"
              onClick={handleMicStart}
              disabled={!consentObtained}
              className="switch-to-mic-button inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              対面録音に切替
            </button>
          </div>
        </div>
      )}

      {/* ── 会議 URL 入力フォーム（Req 1.1, 1.2） ────────────────────────── */}
      <form
        onSubmit={handleRecallSubmit}
        className="meeting-url-form flex flex-col gap-3"
        noValidate
      >
        <div className="meeting-url-field">
          <label
            htmlFor="meeting-url"
            className="block text-sm font-medium text-gray-700"
          >
            会議 URL
          </label>
          <input
            id="meeting-url"
            type="text"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://zoom.us/j/... または Google Meet / Teams の URL"
            disabled={!consentObtained}
            aria-describedby={
              urlFormatError !== null ? 'url-format-error' : undefined
            }
            className="meeting-url-input mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:opacity-50"
          />
          {/* クライアント URL フォーマットエラー（UX フィードバック専用） */}
          {urlFormatError !== null && (
            <p
              id="url-format-error"
              role="alert"
              className="url-format-error mt-1 text-xs text-red-600"
            >
              {urlFormatError}
            </p>
          )}
        </div>
        {/* Req 3.5 制御要素 1/3: オンライン会議の録音開始 */}
        <button
          type="submit"
          disabled={!consentObtained}
          className="start-recall-button inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          オンライン会議を録音開始
        </button>
      </form>

      {/* ── 対面録音（主要パス）（Req 1.5） ──────────────────────────────── */}
      <div className="mic-option border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={handleMicStart}
          disabled={!consentObtained}
          className="start-mic-button inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          対面録音で開始
        </button>
      </div>
    </section>
  );
}

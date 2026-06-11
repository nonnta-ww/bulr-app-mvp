'use client';
/**
 * useLiveState — ライブキャプチャ状態のポーリング hook
 *
 * 設計方針（design.md: LiveStateAPI, Req 8.2）:
 * - DB を真実源とし、クライアントに面接進行状態を保持しない（8.2 の構造的保証）。
 * - `cursor=0` で全量取得 → リロード時にも全トランスクリプト/カバレッジ/候補が復元される（8.2）。
 * - 取得成功ごとに segments を蓄積し cursor を進める。
 *   coverage / currentProposal / captureStatus 等は最新値で上書き（スナップショット）。
 *
 * ポーリング間隔（design.md: LiveStateAPI API Contract）:
 *   BASE_INTERVAL_MS = 2500ms
 *
 * バックオフカーブ（エラー時）:
 *   初回失敗 → 5000ms 待機（BASE * 2）
 *   2回目失敗 → 10000ms 待機（5000 * 2 = 10000、上限でキャップ）
 *   3回目以降 → 10000ms 待機（上限維持）
 *   成功時 → バックオフをリセット、次のポーリングは BASE_INTERVAL_MS (2500ms) 後
 *
 * ポーリング停止条件:
 *   captureStatus が 'stopped' | 'aborted' | 'failed' のいずれかになると
 *   タイマーを再スケジュールせず停止する。
 *   再開は refetch() 呼び出し（例: startCapture 成功後に CaptureStartPanel から呼ぶ）。
 *
 * AbortController:
 *   各フェッチに独立した AbortController を割り当て。
 *   アンマウント時と次フェッチ開始時に前のリクエストをキャンセルし、
 *   `mounted` ローカル変数で setState-after-unmount を防ぐ。
 *
 * Requirements: 3.5, 8.2
 * Design: LiveStateAPI (API Contract, LiveState interface fields)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { LiveStateSchema } from '../../../../../lib/capture/live-state';
import type {
  LiveState,
  LiveSegment,
  PatternCoverageSummary,
  ProposalView,
} from '../../../../../lib/capture/live-state';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 通常ポーリング間隔（ミリ秒） */
const BASE_INTERVAL_MS = 2500;

/** バックオフ上限（ミリ秒） */
const MAX_BACKOFF_MS = 10000;

/**
 * ポーリング停止となるターミナル captureStatus。
 * - 'stopped': 面接終了後の最終状態
 * - 'aborted': 面接中止後の最終状態
 * - 'failed': ボット参加失敗などで手動操作が必要な状態
 *
 * 'failed' を停止条件に含めるのは、ユーザーが再試行操作（startCapture）を
 * 行うまでポーリングを継続しても意味がないため。再試行後は refetch() で再開する。
 */
const TERMINAL_STATUSES = new Set<LiveState['captureStatus']>([
  'stopped',
  'aborted',
  'failed',
]);

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface UseLiveStateOptions {
  /** false のとき polling を停止する（デフォルト: true） */
  enabled?: boolean;
}

export interface UseLiveStateResult {
  captureStatus: LiveState['captureStatus'];
  segments: LiveSegment[];
  coverage: PatternCoverageSummary[];
  currentProposal: ProposalView | null;
  staleTranscript: boolean;
  analysisCapped: boolean;
  elapsedSeconds: number;
  remainingPlannedPatterns: number;
  isLoading: boolean;
  error: Error | null;
  /**
   * ポーリングを cursor=0 から再開する。
   * ターミナル状態になった後に startCapture を呼び出した場合などに使用する。
   */
  refetch: () => void;
}

type LiveStateInternalState = Omit<UseLiveStateResult, 'refetch'>;

const INITIAL_STATE: LiveStateInternalState = {
  captureStatus: 'idle',
  segments: [],
  coverage: [],
  currentProposal: null,
  staleTranscript: false,
  analysisCapped: false,
  elapsedSeconds: 0,
  remainingPlannedPatterns: 0,
  isLoading: true,
  error: null,
};

// ---------------------------------------------------------------------------
// フック本体
// ---------------------------------------------------------------------------

/**
 * 指定セッションの live-state を 2.5 秒間隔でポーリングし、
 * 蓄積されたトランスクリプトセグメントと最新スナップショットを返す。
 *
 * @param sessionId  - ポーリング対象のセッション ID
 * @param options    - 任意オプション（enabled フラグ）
 */
export function useLiveState(
  sessionId: string,
  options?: UseLiveStateOptions,
): UseLiveStateResult {
  const enabled = options?.enabled ?? true;

  const [internalState, setInternalState] = useState<LiveStateInternalState>(INITIAL_STATE);

  /**
   * ポーリング再開トリガ。
   * refetch() が呼ばれるたびにインクリメントされ、useEffect の依存に入れることで
   * effect を再実行（= cursor リセット + ポーリング再開）する。
   */
  const [refetchTick, setRefetchTick] = useState(0);

  const refetch = useCallback(() => {
    setRefetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // ローカル変数でマウント状態を追跡（同 hook インスタンス内の閉包）
    let mounted = true;

    // セッション変更・refetch 時に状態をリセット
    setInternalState(INITIAL_STATE);

    // このエフェクト実行内のローカルカーソル
    let cursor = 0;

    // バックオフ管理
    let backoffMs = BASE_INTERVAL_MS;

    // タイマーハンドル
    let timer: ReturnType<typeof setTimeout> | null = null;

    // 現在実行中のフェッチ用コントローラ
    let abortController: AbortController | null = null;

    /**
     * live-state エンドポイントを一度フェッチし、成功・失敗に応じて
     * 次のポーリングタイマーをスケジュールする。
     */
    async function fetchState(): Promise<void> {
      if (!mounted) return;

      // 前のリクエストをキャンセル（再入防止）
      abortController?.abort();
      const controller = new AbortController();
      abortController = controller;

      try {
        const url = `/api/interview/sessions/${sessionId}/live-state?cursor=${cursor}`;
        const res = await fetch(url, { signal: controller.signal });

        if (!mounted) return;

        if (!res.ok) {
          throw new Error(`live-state fetch failed: HTTP ${res.status}`);
        }

        const json: unknown = await res.json();
        if (!mounted) return;

        const liveState = LiveStateSchema.parse(json);

        // 成功 → バックオフリセット
        backoffMs = BASE_INTERVAL_MS;

        // cursor を進める
        cursor = liveState.nextCursor;

        // segments を蓄積、他フィールドは最新値で上書き
        setInternalState((prev) => ({
          captureStatus: liveState.captureStatus,
          segments: [...prev.segments, ...liveState.segments],
          coverage: liveState.coverage,
          currentProposal: liveState.currentProposal,
          staleTranscript: liveState.staleTranscript,
          analysisCapped: liveState.analysisCapped,
          elapsedSeconds: liveState.elapsedSeconds,
          remainingPlannedPatterns: liveState.remainingPlannedPatterns,
          isLoading: false,
          error: null,
        }));

        // ターミナル状態ならポーリング停止
        if (TERMINAL_STATUSES.has(liveState.captureStatus)) {
          return;
        }

        if (mounted) {
          timer = setTimeout(fetchState, BASE_INTERVAL_MS);
        }
      } catch (err) {
        if (!mounted) return;
        // AbortError はキャンセルによる正常終了 — error に反映しない
        if (err instanceof Error && err.name === 'AbortError') return;

        // バックオフ: 現在値を 2 倍して上限でキャップ
        const nextBackoff = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        backoffMs = nextBackoff;

        setInternalState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));

        if (mounted) {
          timer = setTimeout(fetchState, nextBackoff);
        }
      }
    }

    // 即座に最初のフェッチを開始（cursor=0 → 全量取得 = リロード復元）
    void fetchState();

    return () => {
      mounted = false;
      if (timer !== null) {
        clearTimeout(timer);
      }
      abortController?.abort();
    };
  // refetchTick は「refetch() が呼ばれた回数」で依存に入れることで
  // ターミナル状態後の再起動を実現する
  }, [sessionId, enabled, refetchTick]);

  return {
    ...internalState,
    refetch,
  };
}

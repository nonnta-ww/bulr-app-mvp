// @vitest-environment jsdom
/**
 * useLiveState hook のテスト
 *
 * 検証内容:
 *  - 最初のフェッチは cursor=0（リロード復元 Req 8.2）
 *  - 2 回のポーリングでセグメントが蓄積される（カーソル差分マージ）
 *  - エラー時バックオフ（5000ms → 10000ms → 10000ms）: 2500ms では再試行しない
 *  - 成功後はバックオフが 2500ms にリセットされる
 *  - ターミナル captureStatus でポーリングが停止する
 *  - リロード復元: cursor=0 の全量返却でセグメント/coverage/proposal が復元される
 *  - refetch() でポーリングが再開する
 *
 * Requirements: 3.5, 8.2
 * Design: LiveStateAPI, use-live-state.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { LiveState, LiveSegment, PatternCoverageSummary, ProposalView } from '../../../../../lib/capture/live-state';
import { useLiveState } from './use-live-state';

// ---------------------------------------------------------------------------
// ヘルパー: テスト用 LiveState/LiveSegment 生成
// ---------------------------------------------------------------------------

function makeLiveSegment(seq: number, overrides?: Partial<LiveSegment>): LiveSegment {
  return {
    seq,
    speakerRole: 'interviewer',
    speakerLabel: '面接官',
    text: `発話 ${seq}`,
    startedAtMs: (seq - 1) * 5000,
    endedAtMs: seq * 5000,
    ...overrides,
  };
}

function makeCoverage(patternCode: string): PatternCoverageSummary {
  return {
    patternCode,
    status: 'not_started',
    levelReached: null,
  };
}

function makeLiveState(overrides?: Partial<LiveState>): LiveState {
  return {
    captureStatus: 'recording',
    staleTranscript: false,
    analysisCapped: false,
    segments: [],
    coverage: [],
    currentProposal: null,
    elapsedSeconds: 0,
    remainingPlannedPatterns: 0,
    nextCursor: 0,
    ...overrides,
  };
}

function makeOkResponse(liveState: LiveState): Response {
  return {
    ok: true,
    json: () => Promise.resolve(liveState),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('useLiveState', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Req 8.2: リロード復元 — cursor=0 で全量取得
  // -------------------------------------------------------------------------

  describe('リロード復元 (Req 8.2)', () => {
    it('マウント時の最初のフェッチは cursor=0 を使用する', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeOkResponse(makeLiveState({ nextCursor: 3, segments: [makeLiveSegment(1)] })),
      );
      vi.stubGlobal('fetch', mockFetch);

      renderHook(() => useLiveState('session-abc'));

      // 最初のフェッチ（即座に発火）が完了するまで待つ
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('cursor=0');
      expect(calledUrl).toContain('session-abc');
    });

    it('cursor=0 の全量返却でセグメント・coverage・proposal が復元される', async () => {
      const segments = [makeLiveSegment(1), makeLiveSegment(2), makeLiveSegment(3)];
      const coverage = [makeCoverage('P001'), makeCoverage('P002')];
      const proposal: ProposalView = {
        candidates: [
          { text: '質問A', intent: 'パターン確認' },
          { text: '質問B', intent: 'パターン確認' },
          { text: '質問C', intent: 'パターン確認' },
        ],
        selectedIndex: null,
      };

      const fullState = makeLiveState({
        segments,
        coverage,
        currentProposal: proposal,
        nextCursor: 3,
        elapsedSeconds: 120,
        remainingPlannedPatterns: 5,
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(fullState)));

      const { result } = renderHook(() => useLiveState('session-reload'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.segments).toHaveLength(3);
      expect(result.current.coverage).toHaveLength(2);
      expect(result.current.currentProposal).not.toBeNull();
      expect(result.current.elapsedSeconds).toBe(120);
      expect(result.current.remainingPlannedPatterns).toBe(5);
      expect(result.current.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // ポーリング: 2 回のフェッチでセグメントが蓄積される
  // -------------------------------------------------------------------------

  describe('ポーリング動作', () => {
    it('2 回のポーリングでセグメントが蓄積され、cursor が進む', async () => {
      const seg1 = makeLiveSegment(1);
      const seg2 = makeLiveSegment(2);

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          makeOkResponse(makeLiveState({ segments: [seg1], nextCursor: 1 })),
        )
        .mockResolvedValueOnce(
          makeOkResponse(makeLiveState({ segments: [seg2], nextCursor: 2 })),
        );
      vi.stubGlobal('fetch', mockFetch);

      const { result } = renderHook(() => useLiveState('session-poll'));

      // 1 回目フェッチ完了
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.segments).toHaveLength(1);

      // 2500ms 経過 → 2 回目フェッチ
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // 2 回目フェッチは cursor=1 で呼ばれる
      const secondUrl = mockFetch.mock.calls[1]![0] as string;
      expect(secondUrl).toContain('cursor=1');
      // セグメントが蓄積される
      expect(result.current.segments).toHaveLength(2);
    });

    it('セグメントが空のレスポンスでは cursor が進まない', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          makeOkResponse(makeLiveState({ segments: [], nextCursor: 5 })),
        )
        .mockResolvedValueOnce(
          makeOkResponse(makeLiveState({ segments: [], nextCursor: 5 })),
        );
      vi.stubGlobal('fetch', mockFetch);

      const { result } = renderHook(() => useLiveState('session-no-new'));

      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      // 次のフェッチ
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });

      const secondUrl = mockFetch.mock.calls[1]![0] as string;
      expect(secondUrl).toContain('cursor=5');
      expect(result.current.segments).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // バックオフ: エラー時に 2500ms より長い待ち、上限 10000ms
  // -------------------------------------------------------------------------

  describe('エラー時バックオフ', () => {
    it('フェッチ失敗後に 2500ms では再試行せず、5000ms 後に再試行する', async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue(makeOkResponse(makeLiveState({ nextCursor: 0 })));
      vi.stubGlobal('fetch', mockFetch);

      renderHook(() => useLiveState('session-backoff'));

      // 最初のフェッチが失敗
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 2500ms 経過 — まだ再試行しない（バックオフは 5000ms）
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // さらに 2500ms 経過（合計 5000ms）— 再試行する
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('連続失敗でバックオフが成長し 10000ms でキャップされる', async () => {
      // バックオフカーブ: 5000ms → 10000ms → 10000ms（キャップ）
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('err1'))
        .mockRejectedValueOnce(new Error('err2'))
        .mockRejectedValueOnce(new Error('err3'))
        .mockRejectedValueOnce(new Error('err4'))
        .mockResolvedValue(makeOkResponse(makeLiveState({ nextCursor: 0 })));
      vi.stubGlobal('fetch', mockFetch);

      renderHook(() => useLiveState('session-backoff-grow'));

      // 1 回目失敗（t=0）
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 2500ms 時点では再試行しない（バックオフは 5000ms）
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 5000ms 時点（合計）で 2 回目の試行（1 回目バックオフ = 5000ms）
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 2 回目の失敗後のバックオフは 10000ms
      // 5000ms 後ではまだ再試行しない
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 10000ms 後（合計 t=5000+5000+5000=15000ms）で 3 回目の試行
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // 3 回目の失敗後のバックオフも 10000ms（キャップ維持）
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('成功後はバックオフが 2500ms にリセットされる', async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('first error'))
        .mockResolvedValueOnce(makeOkResponse(makeLiveState({ nextCursor: 1 })))
        .mockResolvedValueOnce(makeOkResponse(makeLiveState({ nextCursor: 2 })));
      vi.stubGlobal('fetch', mockFetch);

      renderHook(() => useLiveState('session-reset'));

      // 1 回目失敗
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 5000ms 後に 2 回目（成功）
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 成功後は 2500ms でポーリングが再開（バックオフリセット）
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('フック失敗後にクラッシュしない', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('persistent error'));
      vi.stubGlobal('fetch', mockFetch);

      const { result } = renderHook(() => useLiveState('session-crash'));

      // エラーが発生してもクラッシュせず error を返す
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.captureStatus).toBe('idle'); // デフォルト値
    });
  });

  // -------------------------------------------------------------------------
  // 停止条件: ターミナル captureStatus でポーリング停止
  // -------------------------------------------------------------------------

  describe('ポーリング停止条件', () => {
    it.each(['stopped', 'aborted', 'failed'] as const)(
      'captureStatus="%s" でポーリングが停止する',
      async (terminalStatus) => {
        const mockFetch = vi.fn().mockResolvedValue(
          makeOkResponse(makeLiveState({ captureStatus: terminalStatus, nextCursor: 5 })),
        );
        vi.stubGlobal('fetch', mockFetch);

        renderHook(() => useLiveState('session-terminal'));

        // 最初のフェッチ
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // 2500ms * 3 経過してもポーリングしない
        await act(async () => { await vi.advanceTimersByTimeAsync(7500); });
        expect(mockFetch).toHaveBeenCalledTimes(1);
      },
    );
  });

  // -------------------------------------------------------------------------
  // アンマウント: タイマーとフェッチがクリアされる
  // -------------------------------------------------------------------------

  describe('アンマウント後のクリーンアップ', () => {
    it('アンマウント後に setState が呼ばれない（メモリリークなし）', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeOkResponse(makeLiveState({ nextCursor: 1 })),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { unmount } = renderHook(() => useLiveState('session-unmount'));

      // アンマウント（タイマーは発火しない状態）
      unmount();

      // アンマウント後にタイマーが進んでも追加フェッチはない
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });

      // フェッチは 0 回（アンマウント前にまだ完了していない）か
      // アンマウント直後のため最初のフェッチは 1 回以下
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // refetch: ポーリング再開
  // -------------------------------------------------------------------------

  describe('refetch()', () => {
    it('ターミナル状態後に refetch() を呼ぶとポーリングが再開する', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          makeOkResponse(makeLiveState({ captureStatus: 'stopped', nextCursor: 5 })),
        )
        .mockResolvedValueOnce(
          makeOkResponse(makeLiveState({ captureStatus: 'recording', nextCursor: 6 })),
        );
      vi.stubGlobal('fetch', mockFetch);

      const { result } = renderHook(() => useLiveState('session-refetch'));

      // ターミナル状態になる
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(result.current.captureStatus).toBe('stopped');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 時間が経過してもポーリングしない
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // refetch() でポーリング再開
      await act(async () => {
        result.current.refetch();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

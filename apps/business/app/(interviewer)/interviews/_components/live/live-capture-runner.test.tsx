// @vitest-environment jsdom
/**
 * LiveCaptureRunner コンポーネントのテスト
 *
 * 検証内容:
 *  - 操作要素が「キャプチャ開始」「面接終了」「中止」の 3 つのみ（Req 3.5）
 *  - 「面接終了」クリックで stopCapture({ sessionId, reason: 'finish' }) が呼ばれる
 *  - 「中止」クリックで stopCapture({ sessionId, reason: 'abort' }) が呼ばれる
 *  - 「キャプチャ開始」クリックで startCapture が呼ばれる
 *  - フックから取得したセグメントが描画される（Req 8.2）
 *
 * Requirements: 3.5, 8.2
 * Design: LiveCaptureRunner / CaptureStartPanel / LiveTranscriptPane / SidePanel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LiveSegment } from '../../../../../lib/capture/live-state';

// ---------------------------------------------------------------------------
// モジュールモック（vi.mock はファイル先頭に巻き上げられる）
//
// - use-live-state: フックが返す状態をテストごとに制御するためにモック
// - start-capture / stop-capture: 'use server' / server-only import を回避するためにモック
// ---------------------------------------------------------------------------

vi.mock('./use-live-state', () => ({
  useLiveState: vi.fn(),
}));

vi.mock('../../[sessionId]/_actions/start-capture', () => ({
  startCapture: vi.fn(),
}));

vi.mock('../../[sessionId]/_actions/stop-capture', () => ({
  stopCapture: vi.fn(),
}));

// ---------------------------------------------------------------------------
// モック後のインポート（vi.mock の後でインポートすることが重要）
// ---------------------------------------------------------------------------

import { LiveCaptureRunner } from './live-capture-runner';
import { useLiveState } from './use-live-state';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

type HookResult = ReturnType<typeof useLiveState>;

function makeDefaultHookResult(overrides?: Partial<HookResult>): HookResult {
  return {
    captureStatus: 'idle',
    segments: [] as LiveSegment[],
    coverage: [],
    currentProposal: null,
    staleTranscript: false,
    analysisCapped: false,
    elapsedSeconds: 0,
    remainingPlannedPatterns: 0,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function makeLiveSegment(seq: number): LiveSegment {
  return {
    seq,
    speakerRole: 'interviewer',
    speakerLabel: '面接官',
    text: `テスト発話 seq=${seq}`,
    startedAtMs: 0,
    endedAtMs: 5000,
  };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult());
});

afterEach(() => {
  // @testing-library/react の DOM クリーンアップ（vitest globals が無効なため手動呼び出し）
  cleanup();
  vi.clearAllMocks();
});

describe('LiveCaptureRunner', () => {
  // -------------------------------------------------------------------------
  // Req 3.5: 操作要素は開始・終了・中止の 3 つのみ
  // -------------------------------------------------------------------------

  describe('操作要素 (Req 3.5)', () => {
    it('idle 状態では「キャプチャ開始」ボタンが 1 つだけ存在する', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByRole('button', { name: /キャプチャ開始|start/i })).toBeInTheDocument();
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
    });

    it('recording 状態では「面接終了」「中止」ボタンが存在する', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByRole('button', { name: /面接終了|finish/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /中止|abort/i })).toBeInTheDocument();
    });

    it('recording 状態では「キャプチャ開始」ボタンが存在せず 2 ボタンのみ', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      expect(screen.queryByRole('button', { name: /キャプチャ開始|start/i })).toBeNull();
    });

    it('idle 状態では面接終了・中止ボタンが存在しない', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.queryByRole('button', { name: /面接終了|finish/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /中止|abort/i })).toBeNull();
    });

    it('stopped 状態では操作ボタンが存在しない', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'stopped' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // ボタンアクション
  // -------------------------------------------------------------------------

  describe('ボタンアクション', () => {
    it('「面接終了」クリックで stopCapture({ sessionId, reason: "finish" }) が呼ばれる', async () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      const mockStop = vi.fn().mockResolvedValue({ ok: true, data: {} });
      render(
        <LiveCaptureRunner
          sessionId="session-finish"
          startCapture={vi.fn() as never}
          stopCapture={mockStop as never}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /面接終了|finish/i }));

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockStop).toHaveBeenCalledWith({
        sessionId: 'session-finish',
        reason: 'finish',
      });
    });

    it('「中止」クリックで stopCapture({ sessionId, reason: "abort" }) が呼ばれる', async () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      const mockStop = vi.fn().mockResolvedValue({ ok: true, data: {} });
      render(
        <LiveCaptureRunner
          sessionId="session-abort"
          startCapture={vi.fn() as never}
          stopCapture={mockStop as never}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /中止|abort/i }));

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockStop).toHaveBeenCalledWith({
        sessionId: 'session-abort',
        reason: 'abort',
      });
    });

    it('「キャプチャ開始」クリックで startCapture({ sessionId, ... }) が呼ばれる', async () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      const mockStart = vi.fn().mockResolvedValue({ ok: true, data: {} });
      render(
        <LiveCaptureRunner
          sessionId="session-start"
          startCapture={mockStart as never}
          stopCapture={vi.fn() as never}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /キャプチャ開始|start/i }));

      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-start' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Req 8.2: フックの返却値のみで描画（進行状態をクライアントに保持しない）
  // -------------------------------------------------------------------------

  describe('セグメント描画 (Req 8.2)', () => {
    it('フックから取得したセグメントが画面に表示される', () => {
      const segments = [makeLiveSegment(1), makeLiveSegment(2)];
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({
          captureStatus: 'recording',
          segments,
        }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByText('テスト発話 seq=1')).toBeInTheDocument();
      expect(screen.getByText('テスト発話 seq=2')).toBeInTheDocument();
    });

    it('staleTranscript=true のとき警告が表示される', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording', staleTranscript: true }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

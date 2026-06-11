// @vitest-environment jsdom
/**
 * LiveCaptureRunner コンポーネントのテスト
 *
 * 検証内容:
 *  - 操作要素が「キャプチャ開始系」「面接終了」「中止」の 3 種のみ（Req 3.5）
 *  - 「面接終了」クリックで stopCapture({ sessionId, reason: 'finish' }) が呼ばれる
 *  - 「中止」クリックで stopCapture({ sessionId, reason: 'abort' }) が呼ばれる
 *  - 「対面録音で開始」クリックで startCapture が呼ばれる
 *  - フックから取得したセグメントが描画される（Req 8.2）
 *  - idle 状態では CaptureStartPanel が表示される（task 5.5 パネル結線）
 *  - recording 状態では LiveTranscriptPane + SidePanel が表示される（task 5.5 パネル結線）
 *
 * Requirements: 3.5, 6.1, 8.2
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
  // Req 3.5: 操作要素は開始・終了・中止の 3 種のみ
  // -------------------------------------------------------------------------

  describe('操作要素 (Req 3.5)', () => {
    it('idle 状態では会議 URL 入力と開始ボタンが表示される（CaptureStartPanel）', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // CaptureStartPanel の会議 URL テキストボックス
      expect(screen.getByRole('textbox', { name: /会議 URL/i })).toBeInTheDocument();
      // recall 開始ボタン
      expect(screen.getByRole('button', { name: /オンライン会議を録音開始/i })).toBeInTheDocument();
      // mic 開始ボタン
      expect(screen.getByRole('button', { name: /対面録音で開始/i })).toBeInTheDocument();
    });

    it('idle 状態では CaptureStartPanel の 2 つの開始ボタンが表示される', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // idle 状態のボタン: "オンライン会議を録音開始"（submit）+ "対面録音で開始"（button）= 2 個
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('recording 状態では「面接終了」「中止」ボタンが存在する', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByRole('button', { name: /面接終了|finish/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /中止|abort/i })).toBeInTheDocument();
    });

    it('recording 状態では開始系ボタンが存在せず 2 ボタンのみ（面接終了・中止）', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // recording 状態: LiveTranscriptPane + SidePanel には操作ボタンなし。
      // capture-controls に finish + abort の 2 ボタンのみ。
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      // 開始系ボタン（CaptureStartPanel）が存在しない
      expect(screen.queryByRole('button', { name: /オンライン会議を録音開始/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /対面録音で開始/i })).toBeNull();
    });

    it('idle 状態では面接終了・中止ボタンが存在しない', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
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
          consentObtained={true}
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
          consentObtained={true}
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
          consentObtained={true}
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

    it('「対面録音で開始」クリックで startCapture({ sessionId, mode:{kind:"mic"} }) が呼ばれる', async () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      const mockStart = vi.fn().mockResolvedValue({ ok: true, data: {} });
      render(
        <LiveCaptureRunner
          sessionId="session-start"
          consentObtained={true}
          startCapture={mockStart as never}
          stopCapture={vi.fn() as never}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /対面録音で開始/i }));

      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-start', mode: { kind: 'mic' } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Req 8.2: フックの返却値のみで描画（進行状態をクライアントに保持しない）
  // -------------------------------------------------------------------------

  describe('セグメント描画 (Req 8.2)', () => {
    it('フックから取得したセグメントが LiveTranscriptPane に表示される', () => {
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
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByText('テスト発話 seq=1')).toBeInTheDocument();
      expect(screen.getByText('テスト発話 seq=2')).toBeInTheDocument();
    });

    it('staleTranscript=true のとき LiveTranscriptPane が遅延通知を表示する', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording', staleTranscript: true }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // LiveTranscriptPane は role="status" で遅延通知を表示する（role="alert" ではない）
      expect(screen.getByText(/転写が遅延しています/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // パネル結線 (Req 6.1, task 5.5)
  // idle/failed → CaptureStartPanel; recording/stopping → LiveTranscriptPane + SidePanel
  // -------------------------------------------------------------------------

  describe('パネル結線 (Req 6.1)', () => {
    it('idle 状態では "ライブトランスクリプト" セクションが表示されない（LiveTranscriptPane は非表示）', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.queryByRole('region', { name: /ライブトランスクリプト/i })).toBeNull();
    });

    it('idle 状態では "面接サイドパネル" が表示されない（SidePanel は非表示）', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'idle' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.queryByRole('complementary', { name: /面接サイドパネル/i })).toBeNull();
    });

    it('recording 状態では LiveTranscriptPane のセクションが表示される', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // LiveTranscriptPane の aria-label="ライブトランスクリプト" セクション
      expect(screen.getByRole('region', { name: /ライブトランスクリプト/i })).toBeInTheDocument();
    });

    it('recording 状態では SidePanel が表示される', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // SidePanel の aria-label="面接サイドパネル" aside 要素
      expect(screen.getByRole('complementary', { name: /面接サイドパネル/i })).toBeInTheDocument();
    });

    it('recording 状態では CaptureStartPanel（会議 URL 入力）が表示されない', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({ captureStatus: 'recording' }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.queryByRole('textbox', { name: /会議 URL/i })).toBeNull();
    });

    it('failed 状態でも CaptureStartPanel が表示される', () => {
      vi.mocked(useLiveState).mockReturnValue(makeDefaultHookResult({ captureStatus: 'failed' }));

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      // CaptureStartPanel は idle + failed の両方で表示される
      expect(screen.getByRole('textbox', { name: /会議 URL/i })).toBeInTheDocument();
    });

    it('SidePanel の経過時間（00:00）と残りパターン数が表示される', () => {
      vi.mocked(useLiveState).mockReturnValue(
        makeDefaultHookResult({
          captureStatus: 'recording',
          elapsedSeconds: 0,
          remainingPlannedPatterns: 5,
        }),
      );

      render(
        <LiveCaptureRunner
          sessionId="s1"
          consentObtained={true}
          startCapture={vi.fn() as never}
          stopCapture={vi.fn() as never}
        />,
      );

      expect(screen.getByLabelText(/経過時間/i)).toBeInTheDocument();
      expect(screen.getByText(/残り 5 パターン/i)).toBeInTheDocument();
    });
  });
});

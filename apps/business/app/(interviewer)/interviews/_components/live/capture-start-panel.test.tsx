// @vitest-environment jsdom
/**
 * CaptureStartPanel コンポーネントのテスト
 *
 * 検証内容:
 *  - 無効な URL を送信するとフォーマットエラーが表示され onStartRecall は呼ばれない（Req 1.2）
 *  - 有効な Zoom / Meet URL を送信すると onStartRecall が URL 引数で呼ばれる（Req 1.1）
 *  - 参加失敗状態では失敗理由・再試行・対面切替ボタンが表示される（Req 1.4）
 *  - 再試行ボタンで onStartRecall が呼ばれ、対面切替で onStartMic が呼ばれる（Req 1.4）
 *  - 同意未記録状態では同意エラーが表示され開始ボタンが disabled になる（Req 1.6）
 *  - disabled ボタンをクリックしても onStartRecall は呼ばれない（Req 1.6）
 *
 * Requirements: 1.1, 1.2, 1.4, 1.6
 * Design: CaptureStartPanel / "LiveCaptureRunner / CaptureStartPanel …"
 *         / "Error Handling"（ボット参加失敗 → 理由表示 + 再試行/対面切替）
 *         / Requirements Traceability 行 1.1, 1.2, 1.4, 1.6
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptureStartPanel } from './capture-start-panel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

const VALID_ZOOM_URL = 'https://zoom.us/j/1234567890';
const VALID_MEET_URL = 'https://meet.google.com/abc-defg-hij';
const VALID_TEAMS_URL =
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abcDEF';
const INVALID_URL = 'https://example.com/x';

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('CaptureStartPanel', () => {
  // --------------------------------------------------------------------------
  // Req 1.2: 無効な URL のフォーマットエラー表示
  // --------------------------------------------------------------------------

  describe('無効な URL を送信したとき (Req 1.2)', () => {
    it('フォーマットエラーが表示され 3 サービス名（Zoom / Google Meet / Microsoft Teams）が含まれる', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="idle"
        />,
      );

      await user.type(screen.getByLabelText('会議 URL'), INVALID_URL);
      await user.click(screen.getByRole('button', { name: /録音開始/ }));

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/Zoom/);
      expect(alert.textContent).toMatch(/Google Meet/);
      expect(alert.textContent).toMatch(/Microsoft Teams/);
    });

    it('onStartRecall は呼ばれない', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="idle"
        />,
      );

      await user.type(screen.getByLabelText('会議 URL'), INVALID_URL);
      await user.click(screen.getByRole('button', { name: /録音開始/ }));

      expect(onStartRecall).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Req 1.1: 有効な URL の場合 onStartRecall が呼ばれる
  // --------------------------------------------------------------------------

  describe('有効な URL を送信したとき (Req 1.1)', () => {
    it('Zoom URL で onStartRecall が URL 引数で呼ばれる', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="idle"
        />,
      );

      await user.type(screen.getByLabelText('会議 URL'), VALID_ZOOM_URL);
      await user.click(screen.getByRole('button', { name: /録音開始/ }));

      expect(onStartRecall).toHaveBeenCalledTimes(1);
      expect(onStartRecall).toHaveBeenCalledWith(VALID_ZOOM_URL);
    });

    it('Google Meet URL で onStartRecall が URL 引数で呼ばれる', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="idle"
        />,
      );

      await user.type(screen.getByLabelText('会議 URL'), VALID_MEET_URL);
      await user.click(screen.getByRole('button', { name: /録音開始/ }));

      expect(onStartRecall).toHaveBeenCalledWith(VALID_MEET_URL);
    });

    it('Microsoft Teams URL で onStartRecall が URL 引数で呼ばれる', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="idle"
        />,
      );

      await user.type(screen.getByLabelText('会議 URL'), VALID_TEAMS_URL);
      await user.click(screen.getByRole('button', { name: /録音開始/ }));

      expect(onStartRecall).toHaveBeenCalledWith(VALID_TEAMS_URL);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('有効な URL 送信後はフォーマットエラーアラートが表示されない', async () => {
      const user = userEvent.setup();

      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="idle"
        />,
      );

      await user.type(screen.getByLabelText('会議 URL'), VALID_ZOOM_URL);
      await user.click(screen.getByRole('button', { name: /録音開始/ }));

      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Req 1.4: 参加失敗状態のエラー表示と再試行・切替ボタン
  // --------------------------------------------------------------------------

  describe('参加失敗状態 (captureStatus="failed") (Req 1.4)', () => {
    it('失敗理由テキスト・再試行・対面切替ボタンが表示される', () => {
      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="failed"
          joinFailureCode="timeout"
          lastMeetingUrl={VALID_ZOOM_URL}
        />,
      );

      // 失敗理由は role="alert" で、timeout コードに対応する文言を表示する
      expect(screen.getByRole('alert')).toHaveTextContent(/タイムアウト/);
      // 再試行ボタン
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      // 対面切替ボタン
      expect(
        screen.getByRole('button', { name: '対面録音に切替' }),
      ).toBeInTheDocument();
    });

    it('再試行ボタンをクリックすると onStartRecall が lastMeetingUrl で呼ばれる', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={true}
          captureStatus="failed"
          joinFailureCode="timeout"
          lastMeetingUrl={VALID_ZOOM_URL}
        />,
      );

      await user.click(screen.getByRole('button', { name: '再試行' }));

      expect(onStartRecall).toHaveBeenCalledTimes(1);
      expect(onStartRecall).toHaveBeenCalledWith(VALID_ZOOM_URL);
    });

    it('対面切替ボタンをクリックすると onStartMic が呼ばれる', async () => {
      const user = userEvent.setup();
      const onStartMic = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={onStartMic}
          consentObtained={true}
          captureStatus="failed"
          joinFailureCode="join_failed"
          lastMeetingUrl={VALID_ZOOM_URL}
        />,
      );

      await user.click(screen.getByRole('button', { name: '対面録音に切替' }));

      expect(onStartMic).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // Req 1.6: 同意未記録状態のエラー表示と開始ブロック
  // --------------------------------------------------------------------------

  describe('同意未記録状態 (consentObtained=false) (Req 1.6)', () => {
    it('同意エラーメッセージが表示される', () => {
      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={vi.fn()}
          consentObtained={false}
          captureStatus="idle"
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/同意/);
    });

    it('録音開始ボタンが disabled になる', () => {
      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={vi.fn()}
          consentObtained={false}
          captureStatus="idle"
        />,
      );

      expect(screen.getByRole('button', { name: /録音開始/ })).toBeDisabled();
    });

    it('disabled ボタンをクリックしても onStartRecall は呼ばれない', async () => {
      const user = userEvent.setup();
      const onStartRecall = vi.fn();

      render(
        <CaptureStartPanel
          onStartRecall={onStartRecall}
          onStartMic={vi.fn()}
          consentObtained={false}
          captureStatus="idle"
        />,
      );

      // @testing-library/user-event v14 は disabled ボタンのクリックを無視する
      await user.click(screen.getByRole('button', { name: /録音開始/ }));
      expect(onStartRecall).not.toHaveBeenCalled();
    });
  });
});

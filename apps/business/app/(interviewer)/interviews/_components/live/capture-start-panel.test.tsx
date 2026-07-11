// @vitest-environment jsdom
/**
 * CaptureStartPanel コンポーネントのテスト
 *
 * 検証内容:
 *  - 無効な URL を送信するとフォーマットエラーが表示され onStartRecall は呼ばれない（Req 1.2）
 *  - 有効な Zoom / Meet URL を送信すると onStartRecall が URL 引数で呼ばれる（Req 1.1）
 *  - 参加失敗状態では失敗理由・再試行・対面切替ボタンが表示される（Req 1.4）
 *  - 再試行ボタンで onStartRecall が呼ばれ、対面切替で onStartMic が呼ばれる（Req 1.4）
 *  - 同意未記録状態では ConsentStep（同意ステップ）が表示され開始ボタンが disabled になる（Req 1.2, 1.6, 2.1, 2.2）
 *  - disabled ボタンをクリックしても onStartRecall は呼ばれない（Req 1.6）
 *
 * Requirements: 1.1, 1.2, 1.4, 1.6, 2.1, 2.2
 * Design: CaptureStartPanel（変更）/ consent-step / "LiveCaptureRunner / CaptureStartPanel …"
 *         / "Error Handling"（ボット参加失敗 → 理由表示 + 再試行/対面切替）
 *         / Requirements Traceability 行 1.1, 1.2, 1.4, 1.6, 2.1, 2.2
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConsentNotice } from '@/lib/consent/consent-notice';
import { CaptureStartPanel } from './capture-start-panel';

// consent-step が呼ぶ実 recordConsent は '@bulr/auth/server'（'server-only'）経由のため、
// jsdom 環境のコンポーネントテストでは読み込めない。import 解決を通すためだけの空実装。
vi.mock('../../[sessionId]/_actions/record-consent', () => ({
  recordConsent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

const SESSION_ID = 'session-1';

const NOTICE: ConsentNotice = {
  version: 'ja-v1',
  title: '面接録音・録画に関する同意のご説明（候補者向け）',
  recordingTarget: 'テスト用録音対象説明',
  purpose: 'テスト用利用目的説明',
  retention: 'テスト用保持期間説明（30日）',
  dataHandling: 'テスト用データ取り扱い説明',
};

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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
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
  // Req 1.2, 1.6, 2.1, 2.2: 同意未記録状態の ConsentStep 表示と開始ブロック（task 3.2 配線）
  // --------------------------------------------------------------------------

  describe('同意未記録状態 (consentObtained=false) (Req 1.2, 1.6, 2.1, 2.2)', () => {
    it('ConsentStep（同意ステップ）が表示される: 同意文タイトルとチェックボックスが描画される', () => {
      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={vi.fn()}
          consentObtained={false}
          sessionId={SESSION_ID}
          notice={NOTICE}
          captureStatus="idle"
        />,
      );

      // consent-step の同意文タイトル（notice.title）
      expect(screen.getByText(NOTICE.title)).toBeInTheDocument();
      // consent-step のチェックボックス「候補者から録音同意を口頭で得た」
      expect(
        screen.getByLabelText('候補者から録音同意を口頭で得た'),
      ).toBeInTheDocument();
      // 旧 CONSENT_ERROR alert は表示されない（consent-step が同ブロックを差し替える）
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('録音開始ボタンが disabled になる', () => {
      render(
        <CaptureStartPanel
          onStartRecall={vi.fn()}
          onStartMic={vi.fn()}
          consentObtained={false}
          sessionId={SESSION_ID}
          notice={NOTICE}
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
          sessionId={SESSION_ID}
          notice={NOTICE}
          captureStatus="idle"
        />,
      );

      // @testing-library/user-event v14 は disabled ボタンのクリックを無視する
      await user.click(screen.getByRole('button', { name: /録音開始/ }));
      expect(onStartRecall).not.toHaveBeenCalled();
    });
  });
});

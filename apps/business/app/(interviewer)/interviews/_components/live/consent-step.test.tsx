// @vitest-environment jsdom
/**
 * ConsentStep コンポーネントのテスト
 *
 * 検証内容:
 *  - 同意文（notice）の各項目（title / recordingTarget / purpose / retention / dataHandling）が描画される（Req 4.1, 4.2）
 *  - チェックボックス未チェックでは確定ボタンが disabled になる（Req 2.2）
 *  - チェック後、確定ボタンをクリックすると recordConsent が { sessionId } で呼ばれる（Req 2.1, 2.3）
 *  - recordConsent が result.ok（単段判定）を返したら router.refresh が呼ばれる
 *  - recordConsent が result.ok=false を返した場合はエラー表示のみでクラッシュしない
 *
 * Requirements: 2.1, 2.2
 * Design: consent-step（ConsentStepProps）/ "System Flows" 同意取得→ゲート通過
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ConsentNotice } from '@/lib/consent/consent-notice';

// ---------------------------------------------------------------------------
// モジュールモック（vi.mock はファイル先頭に巻き上げられる）
// ---------------------------------------------------------------------------

// 実 recordConsent は '@bulr/auth/server'（'server-only'）を経由するため、
// jsdom 環境のコンポーネントテストでは読み込めない。各テストは props で
// recordConsent を注入するため、このモックは import 解決を通すためだけの空実装でよい。
vi.mock('../../[sessionId]/_actions/record-consent', () => ({
  recordConsent: vi.fn(),
}));

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// モック後のインポート（vi.mock の後でインポートすることが重要）
import { ConsentStep } from './consent-step';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

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

describe('ConsentStep', () => {
  // --------------------------------------------------------------------------
  // Req 4.1, 4.2: 同意文の描画
  // --------------------------------------------------------------------------

  describe('同意文の描画 (Req 4.1, 4.2)', () => {
    it('title / recordingTarget / purpose / retention / dataHandling が描画される', () => {
      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={vi.fn()}
        />,
      );

      expect(screen.getByText(NOTICE.title)).toBeInTheDocument();
      expect(screen.getByText(NOTICE.recordingTarget)).toBeInTheDocument();
      expect(screen.getByText(NOTICE.purpose)).toBeInTheDocument();
      expect(screen.getByText(NOTICE.retention)).toBeInTheDocument();
      expect(screen.getByText(NOTICE.dataHandling)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Req 2.2: チェック未了は確定ボタンが disabled
  // --------------------------------------------------------------------------

  describe('チェック未了 (Req 2.2)', () => {
    it('確定ボタンが disabled になる', () => {
      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={vi.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: /確定/ }),
      ).toBeDisabled();
    });

    it('disabled ボタンをクリックしても recordConsent は呼ばれない', async () => {
      const user = userEvent.setup();
      const recordConsent = vi.fn();

      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={recordConsent}
        />,
      );

      await user.click(screen.getByRole('button', { name: /確定/ }));
      expect(recordConsent).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Req 2.1, 2.3: チェック後の確定 → recordConsent 呼び出し → router.refresh
  // --------------------------------------------------------------------------

  describe('チェック後に確定したとき (Req 2.1, 2.3)', () => {
    it('チェック後は確定ボタンが有効になる', async () => {
      const user = userEvent.setup();

      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={vi.fn()}
        />,
      );

      await user.click(
        screen.getByRole('checkbox', { name: /候補者から録音同意を口頭で得た/ }),
      );

      expect(screen.getByRole('button', { name: /確定/ })).toBeEnabled();
    });

    it('確定クリックで recordConsent が { sessionId } 引数で呼ばれる', async () => {
      const user = userEvent.setup();
      const recordConsent = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          consentObtainedAt: '2026-07-12T00:00:00.000Z',
          consentVersion: 'ja-v1',
          alreadyConsented: false,
        },
      });

      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={recordConsent}
        />,
      );

      await user.click(
        screen.getByRole('checkbox', { name: /候補者から録音同意を口頭で得た/ }),
      );
      await user.click(screen.getByRole('button', { name: /確定/ }));

      expect(recordConsent).toHaveBeenCalledTimes(1);
      expect(recordConsent).toHaveBeenCalledWith({ sessionId: SESSION_ID });
    });

    it('recordConsent が result.ok=true を返したら router.refresh が呼ばれる（単段判定）', async () => {
      const user = userEvent.setup();
      const recordConsent = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          consentObtainedAt: '2026-07-12T00:00:00.000Z',
          consentVersion: 'ja-v1',
          alreadyConsented: false,
        },
      });

      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={recordConsent}
        />,
      );

      await user.click(
        screen.getByRole('checkbox', { name: /候補者から録音同意を口頭で得た/ }),
      );
      await user.click(screen.getByRole('button', { name: /確定/ }));

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // result.ok=false のエラーパス（防衛コード）
  // --------------------------------------------------------------------------

  describe('recordConsent が失敗を返したとき', () => {
    it('エラーメッセージを表示し router.refresh は呼ばれない', async () => {
      const user = userEvent.setup();
      const recordConsent = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'FORBIDDEN', message: '権限がありません。' },
      });

      render(
        <ConsentStep
          sessionId={SESSION_ID}
          notice={NOTICE}
          recordConsent={recordConsent}
        />,
      );

      await user.click(
        screen.getByRole('checkbox', { name: /候補者から録音同意を口頭で得た/ }),
      );
      await user.click(screen.getByRole('button', { name: /確定/ }));

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });
});

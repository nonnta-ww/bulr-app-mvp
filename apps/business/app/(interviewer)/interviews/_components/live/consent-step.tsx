'use client';

/**
 * ConsentStep — 同意ステップ UI（面接官アテステーション）
 *
 * 責務:
 *  - 現行版の同意文（ConsentNotice）を描画する — Req 4.1, 4.2
 *  - 「候補者から録音同意を口頭で得た」チェックボックスと確定ボタンを提供する — Req 2.1
 *  - チェック未了は確定ボタンを disabled にする（クライアント側補強）— Req 2.2
 *  - 確定操作でのみ recordConsent({ sessionId }) を呼ぶ（既定値や自動設定では発火しない）— Req 2.3, 2.4
 *  - recordConsent の結果を単段判定（result.ok）し、成功時は router.refresh() で
 *    セッション（Server Component）を再取得して consent 状態の反転を反映する
 *
 * # 契約
 * recordConsent は「二重ラップを避ける単段契約」（design.md: recordConsent Service Interface）。
 * authedAction ラップ後の呼び出し側は result.ok のみを見て成否判定する（result.data.ok は見ない）。
 *
 * Requirements: 2.1, 2.2
 * Design: consent-step（ConsentStepProps）/ "System Flows" 同意取得→ゲート通過
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ConsentNotice } from '@/lib/consent/consent-notice';
import { recordConsent as defaultRecordConsent } from '../../[sessionId]/_actions/record-consent';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * recordConsent の呼び出し結果（単段契約）。
 * authedAction 外層の成否のみを見る: result.ok（result.data.ok は見ない）。
 */
interface RecordConsentResult {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
}

export interface ConsentStepProps {
  sessionId: string;
  notice: ConsentNotice;
  /**
   * recordConsent Server Action。
   * 本番では import デフォルト値を使用。テストでは mock を注入する。
   */
  recordConsent?: (input: { sessionId: string }) => Promise<RecordConsentResult>;
}

// ---------------------------------------------------------------------------
// ロケール文字列（アプリ別文面 — 設計方針: コピーは app 側に持つ）
// ---------------------------------------------------------------------------

const CONSENT_CHECKBOX_LABEL = '候補者から録音同意を口頭で得た';
const CONSENT_CONFIRM_LABEL = '同意を確定';
const CONSENT_RECORD_ERROR = '同意の記録に失敗しました。もう一度お試しください。';

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * ConsentStep
 *
 * capture-start-panel の `!consentObtained` ブロックに描画される（task 3.2 で配線）。
 * 内部状態はチェック状態・送信中フラグ・エラーメッセージのみ。
 */
export function ConsentStep({
  sessionId,
  notice,
  recordConsent = defaultRecordConsent as (input: {
    sessionId: string;
  }) => Promise<RecordConsentResult>,
}: ConsentStepProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // ハンドラ
  // -------------------------------------------------------------------------

  async function handleConfirm(): Promise<void> {
    // チェック未了・二重送信の防衛コード（disabled ボタンのため通常到達しない）
    if (!checked || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await recordConsent({ sessionId });

      // 単段判定: result.ok のみを見る（result.data.ok は見ない — 二重ラップ回避）
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error?.message ?? CONSENT_RECORD_ERROR);
      }
    } catch {
      setError(CONSENT_RECORD_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // レンダリング
  // -------------------------------------------------------------------------

  return (
    <div
      className="consent-step flex flex-col gap-4 rounded-lg border border-hairline bg-canvas p-4"
      aria-label="同意ステップ"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-copper" style={{ fontSize: 18 }}>
          fact_check
        </span>
        <h3 className="text-sm font-semibold text-ink">{notice.title}</h3>
      </div>

      <dl className="consent-notice-body flex flex-col gap-3 text-sm text-body">
        <div>
          <dt className="text-xs font-medium text-muted">録音対象</dt>
          <dd className="mt-0.5">{notice.recordingTarget}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">利用目的</dt>
          <dd className="mt-0.5">{notice.purpose}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">データ保持期間</dt>
          <dd className="mt-0.5">{notice.retention}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">データの取り扱い</dt>
          <dd className="mt-0.5">{notice.dataHandling}</dd>
        </div>
        {notice.sections?.map((section) => (
          <div key={section.heading}>
            <dt className="text-xs font-medium text-muted">{section.heading}</dt>
            <dd className="mt-0.5">{section.body}</dd>
          </div>
        ))}
      </dl>

      {error !== null && (
        <div
          role="alert"
          className="consent-record-error rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <label className="consent-checkbox-label flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={isSubmitting}
          className="mt-0.5 h-4 w-4 rounded border-hairline-strong accent-navy"
        />
        {CONSENT_CHECKBOX_LABEL}
      </label>

      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={!checked || isSubmitting}
        className="consent-confirm-button inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-soft focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '記録中...' : CONSENT_CONFIRM_LABEL}
      </button>
    </div>
  );
}

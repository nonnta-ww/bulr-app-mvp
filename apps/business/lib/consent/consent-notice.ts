/**
 * 版管理された同意文 registry（app ローカル）
 *
 * interview-consent-gate design.md: "Components and Interfaces" > "lib" > "consent-notice"
 * Requirements: 4.1, 4.2, 4.4
 *
 * - 面接官アテステーション（面接開始前の同意ステップ）で提示する同意文の単一情報源。
 * - `recordConsent`（別タスク）はここで定義する CURRENT_CONSENT_VERSION をサーバー側で
 *   stamp し、記録される版と提示された版の一致を保証する（4.3 の起点）。
 * - 文言はプレースホルダ。法務確定後は版キー（'ja-v1'）を変えずに本文のみ差し替える。
 * - 保持期間（retention）の記述は音声データの自動削除ポリシー（約30日）と整合させる。
 */

export interface ConsentNoticeSection {
  heading: string;
  body: string;
}

export interface ConsentNotice {
  version: string;
  title: string;
  /** 録音対象（4.2） */
  recordingTarget: string;
  /** 利用目的（4.2） */
  purpose: string;
  /** データ保持期間: 音声30日自動削除ポリシーと整合させる（4.2, 4.4） */
  retention: string;
  /** データの取り扱い（4.2） */
  dataHandling: string;
  sections?: ConsentNoticeSection[];
}

export const CURRENT_CONSENT_VERSION = 'ja-v1';

const CONSENT_NOTICES: Record<string, ConsentNotice> = {
  'ja-v1': {
    version: 'ja-v1',
    title: '面接録音・録画に関する同意のご説明（候補者向け）',
    recordingTarget:
      '本面接における音声（オンライン面接の場合は会議映像・画面共有を含む）を録音・録画の対象とします。',
    purpose:
      '録音・録画データは、面接内容の記録・振り返り、評価の正確性向上、選考プロセスの品質改善を目的として利用します。目的外の利用は行いません。',
    retention:
      '録音・録画データ（音声）は取得後、約30日で自動的に削除されます（自動削除ポリシー）。文字起こし・評価等の派生データの保持期間は別途社内規定に従います。',
    dataHandling:
      '取得したデータは選考に関わる社内の限られた担当者のみがアクセスでき、選考目的以外での第三者提供は行いません。取り扱いには適切なアクセス制御を適用します。',
  },
};

/**
 * 現行版（CURRENT_CONSENT_VERSION）の同意文を返す。
 * 同意ステップ UI はこの結果を面接官へ提示し、`recordConsent` はこの版キーをサーバー側で stamp する。
 */
export function getCurrentConsentNotice(): ConsentNotice {
  const notice = CONSENT_NOTICES[CURRENT_CONSENT_VERSION];
  if (!notice) {
    throw new Error(
      `Consent notice for CURRENT_CONSENT_VERSION="${CURRENT_CONSENT_VERSION}" is not defined.`,
    );
  }
  return notice;
}

/**
 * 指定した版の同意文を返す。未定義の版は undefined を返す（admin 表示等での安全な参照用）。
 */
export function getConsentNotice(version: string): ConsentNotice | undefined {
  return CONSENT_NOTICES[version];
}

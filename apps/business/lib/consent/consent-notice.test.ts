/**
 * consent-notice registry のユニットテスト
 *
 * interview-consent-gate Requirements: 4.1, 4.2, 4.4
 * design.md: consent-notice（apps/business/lib/consent/consent-notice.ts）
 *
 * テスト戦略:
 * - getCurrentConsentNotice() が CURRENT_CONSENT_VERSION（'ja-v1'）の同意文を返すこと
 * - 必須4要素（録音対象/利用目的/保持期間/データ扱い）が非空文字列で含まれること
 * - 保持期間の記述が音声30日自動削除ポリシーと整合していること（「30日」を含む）
 * - getConsentNotice(version) が既知版で定義済み・未知版で undefined を返すこと
 */

import { describe, it, expect } from 'vitest';
import {
  CURRENT_CONSENT_VERSION,
  getCurrentConsentNotice,
  getConsentNotice,
} from './consent-notice';

describe('consent-notice', () => {
  it('CURRENT_CONSENT_VERSION は ja-v1 である', () => {
    expect(CURRENT_CONSENT_VERSION).toBe('ja-v1');
  });

  it('getCurrentConsentNotice() は version=ja-v1 の同意文を返す', () => {
    const notice = getCurrentConsentNotice();
    expect(notice.version).toBe('ja-v1');
    expect(notice.version).toBe(CURRENT_CONSENT_VERSION);
  });

  it('getCurrentConsentNotice() は必須4要素を非空文字列で含む', () => {
    const notice = getCurrentConsentNotice();

    expect(typeof notice.recordingTarget).toBe('string');
    expect(notice.recordingTarget.length).toBeGreaterThan(0);

    expect(typeof notice.purpose).toBe('string');
    expect(notice.purpose.length).toBeGreaterThan(0);

    expect(typeof notice.retention).toBe('string');
    expect(notice.retention.length).toBeGreaterThan(0);

    expect(typeof notice.dataHandling).toBe('string');
    expect(notice.dataHandling.length).toBeGreaterThan(0);
  });

  it('保持期間の記述は音声30日自動削除ポリシーと整合する（30日を含む）', () => {
    const notice = getCurrentConsentNotice();
    expect(notice.retention).toContain('30日');
  });

  it('getConsentNotice("ja-v1") は現行版と一致する同意文を返す', () => {
    const notice = getConsentNotice('ja-v1');
    expect(notice).toBeDefined();
    expect(notice?.version).toBe('ja-v1');
  });

  it('getConsentNotice("nope") は未知版で undefined を返す', () => {
    expect(getConsentNotice('nope')).toBeUndefined();
  });
});

/**
 * company-invitation-template.ts の純関数ユニットテスト
 *
 * Requirements: 1.1, 1.2
 */

import { describe, it, expect } from 'vitest';
import { renderCompanyInvitationEmail } from './company-invitation-template';

describe('renderCompanyInvitationEmail', () => {
  const url = 'https://business.example.com/invitations/tok_abc123';
  const companyName = 'Acme 株式会社';

  it('subject が空でない文字列を返す', () => {
    const { subject } = renderCompanyInvitationEmail({ url, companyName });
    expect(subject).toBeTruthy();
    expect(typeof subject).toBe('string');
    expect(subject.length).toBeGreaterThan(0);
  });

  it('html が空でない文字列を返す', () => {
    const { html } = renderCompanyInvitationEmail({ url, companyName });
    expect(html).toBeTruthy();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('text が空でない文字列を返す', () => {
    const { text } = renderCompanyInvitationEmail({ url, companyName });
    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('html に受諾 URL が含まれる', () => {
    const { html } = renderCompanyInvitationEmail({ url, companyName });
    expect(html).toContain(url);
  });

  it('text に受諾 URL が含まれる', () => {
    const { text } = renderCompanyInvitationEmail({ url, companyName });
    expect(text).toContain(url);
  });

  it('html に会社名が含まれる', () => {
    const { html } = renderCompanyInvitationEmail({ url, companyName });
    expect(html).toContain(companyName);
  });

  it('text に会社名が含まれる', () => {
    const { text } = renderCompanyInvitationEmail({ url, companyName });
    expect(text).toContain(companyName);
  });

  it('subject に会社名が含まれる', () => {
    const { subject } = renderCompanyInvitationEmail({ url, companyName });
    expect(subject).toContain(companyName);
  });
});

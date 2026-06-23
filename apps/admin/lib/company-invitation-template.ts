/**
 * 企業ユーザー招待メールテンプレート
 * 純関数。副作用なし。
 *
 * admin が企業ユーザーを会社に招待する際に送信するメールの件名・HTML・プレーンテキストを生成する。
 *
 * Requirements: 1.1, 1.2
 */

/**
 * 企業ユーザー招待メールの件名・HTML・プレーンテキストを生成して返す純関数。
 *
 * @param url - 受諾用リンク URL（`BUSINESS_BASE_URL/invitations/:token`）
 * @param companyName - 招待先の会社名
 * @returns { subject, html, text }
 */
export function renderCompanyInvitationEmail({
  url,
  companyName,
}: {
  url: string;
  companyName: string;
}): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `bulr — ${companyName} への招待`;

  const text = `${companyName} への参加招待が届いています。

bulr の企業ユーザーとして ${companyName} に参加するには、下記のリンクをクリックして招待を受諾してください。
このリンクは 7 日間有効です。

${url}

このメールに心当たりがない場合は、無視してください。

---

You have been invited to join ${companyName} on bulr.

To accept the invitation and join ${companyName} as a company user, please click the link below.
This link will expire in 7 days.

${url}

If you didn't expect this invitation, please ignore this email.
`;

  const html = `<!doctype html>
<html>
  <body style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="margin-top: 0;">bulr — 企業ユーザー招待</h2>
    <p><strong>${companyName}</strong> への参加招待が届いています。</p>
    <p>bulr の企業ユーザーとして <strong>${companyName}</strong> に参加するには、下のボタンをクリックして招待を受諾してください。</p>
    <p style="color: #666; font-size: 0.9em;">このリンクは 7 日間有効です。</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 4px;">招待を受諾する</a>
    </p>
    <p>このメールに心当たりがない場合は、無視してください。</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
    <h2 style="margin-top: 0;">bulr — Company User Invitation</h2>
    <p>You have been invited to join <strong>${companyName}</strong> on bulr.</p>
    <p>To accept the invitation and join <strong>${companyName}</strong> as a company user, please click the button below.</p>
    <p style="color: #666; font-size: 0.9em;">This link will expire in 7 days.</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 4px;">Accept Invitation</a>
    </p>
    <p>If you didn't expect this invitation, please ignore this email.</p>
  </body>
</html>`;

  return { subject, html, text };
}

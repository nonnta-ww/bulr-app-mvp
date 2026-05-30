/**
 * Magic Link メールテンプレート
 * 純関数。副作用なし。受信者の個人情報（メールアドレス等）を本文に含まない。
 * Requirements: 2.3, 2.4, 2.5, 2.8
 */

/**
 * Magic Link メールの件名・HTML・プレーンテキストを生成して返す純関数。
 *
 * @param url - Magic Link の URL（Better Auth が生成したトークン付き URL）
 * @returns { subject, html, text }
 */
export function renderMagicLinkEmail({ url }: { url: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = '[bulr] サインインリンク / Sign-in link';

  const text = `bulr へのサインインリンクです（15 分で失効）。

${url}

自分でリクエストしていない場合は、このメールを無視してください。

---

Sign-in link for bulr (expires in 15 minutes).

${url}

If you didn't request this, please ignore this email.
`;

  const html = `<!doctype html>
<html>
  <body style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="margin-top: 0;">bulr — AI 面接アシスタント</h2>
    <p>bulr へのサインインリンクです（15 分で失効）。下のボタンをクリックしてサインインしてください。</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px;">サインイン</a>
    </p>
    <p>自分でリクエストしていない場合は、このメールを無視してください。</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
    <h2 style="margin-top: 0;">bulr — AI Interview Assistant</h2>
    <p>Sign-in link for bulr (expires in 15 minutes). Click the button below to sign in.</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px;">Sign in</a>
    </p>
    <p>If you didn't request this, please ignore this email.</p>
  </body>
</html>`;

  return { subject, html, text };
}

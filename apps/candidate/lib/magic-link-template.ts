/**
 * 候補者向け Magic Link メールテンプレート
 * 純関数。副作用なし。受信者の個人情報（メールアドレス等）を本文に含まない。
 *
 * 候補者（求職者）向けの文面を使用する。企業・運営向けのコピーとは異なる。
 * 招待制 MVP のコンテキストで、採用プロセスへの参加を歓迎するトーンを用いる。
 *
 * Requirements: 2.1, 2.4
 */

/**
 * 候補者向け Magic Link メールの件名・HTML・プレーンテキストを生成して返す純関数。
 *
 * @param url - Magic Link の URL（Better Auth が生成したトークン付き URL）
 * @returns { subject, html, text }
 */
export function renderCandidateMagicLinkEmail({ url }: { url: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = '[bulr] サインインリンク / Sign-in link';

  const text = `bulr へようこそ。

採用プロセスにご参加いただきありがとうございます。
下記のリンクからサインインしてください（15 分で失効します）。

${url}

このメールに心当たりがない場合は、無視してください。

---

Welcome to bulr.

Thank you for participating in the hiring process.
Click the link below to sign in (expires in 15 minutes).

${url}

If you didn't request this, please ignore this email.
`;

  const html = `<!doctype html>
<html>
  <body style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="margin-top: 0;">bulr へようこそ</h2>
    <p>採用プロセスにご参加いただきありがとうございます。</p>
    <p>下のボタンをクリックしてサインインしてください（15 分で失効します）。</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px;">サインイン</a>
    </p>
    <p>このメールに心当たりがない場合は、無視してください。</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
    <h2 style="margin-top: 0;">Welcome to bulr</h2>
    <p>Thank you for participating in the hiring process.</p>
    <p>Click the button below to sign in (expires in 15 minutes).</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 4px;">Sign in</a>
    </p>
    <p>If you didn't request this, please ignore this email.</p>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * 運営（Admin）向け Magic Link メールテンプレート
 * 純関数。副作用なし。受信者の個人情報（メールアドレス等）を本文に含まない。
 *
 * このテンプレートは bulr 運営チーム（内部スタッフ）向けの文面である。
 * 配信先は ADMIN_ALLOWED_EMAILS で制限されているため、社内向けの簡潔な表現を用いる。
 *
 * Requirements: 1.6, 2.3, 8.2
 */

/**
 * 運営向け Magic Link メールの件名・HTML・プレーンテキストを生成して返す純関数。
 *
 * @param url - Magic Link の URL（Better Auth が生成したトークン付き URL）
 * @returns { subject, html, text }
 */
export function renderAdminMagicLinkEmail({ url }: { url: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'bulr 運営 — サインインリンク';

  const text = `bulr 運営ダッシュボードへのサインインリンクです（15 分で失効）。

${url}

このメールに心当たりがない場合は、無視してください。

---

Sign-in link for bulr Admin Dashboard (expires in 15 minutes).

${url}

If you didn't request this, please ignore this email.
`;

  const html = `<!doctype html>
<html>
  <body style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="margin-top: 0;">bulr 運営ダッシュボード</h2>
    <p>サインインリンクです（15 分で失効）。下のボタンをクリックしてサインインしてください。</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 4px;">運営ダッシュボードにサインイン</a>
    </p>
    <p>このメールに心当たりがない場合は、無視してください。</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
    <h2 style="margin-top: 0;">bulr Admin Dashboard</h2>
    <p>Sign-in link (expires in 15 minutes). Click the button below to sign in.</p>
    <p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 4px;">Sign in to Admin Dashboard</a>
    </p>
    <p>If you didn't request this, please ignore this email.</p>
  </body>
</html>`;

  return { subject, html, text };
}

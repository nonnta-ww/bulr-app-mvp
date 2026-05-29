/**
 * メール送信モジュール
 *
 * 開発環境 (SMTP_HOST が設定されている場合): nodemailer で Mailpit (localhost:1025) に送信
 * 本番環境: Resend API で送信
 *
 * 送信元: FROM_ADDRESS を参照
 *   - `EMAIL_FROM_ADDRESS` env を優先（Vercel 各プロジェクト Production / Preview で設定）
 *   - 未設定時は Resend テストドメイン `onboarding@resend.dev`（ローカル dev / 初期セットアップ用）
 */

/**
 * メール送信元アドレス
 */
export const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS ?? 'bulr <onboarding@resend.dev>';

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * メールを送信する。
 * SMTP_HOST が設定されていれば nodemailer (Mailpit) 経由、なければ Resend API を使用する。
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  if (process.env.SMTP_HOST) {
    await sendViaSMTP({ to, subject, html, text });
  } else {
    await sendViaResend({ to, subject, html, text });
  }
}

async function sendViaSMTP({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    ignoreTLS: true,
  });
  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html, text });
}

async function sendViaResend({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      '[resend] RESEND_API_KEY が設定されていません。本番環境では必須です。ローカル開発では SMTP_HOST を設定して Mailpit を使用してください。'
    );
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html, text });
  if (result.error) {
    throw new Error(`[resend] メール送信失敗: ${result.error.message}`);
  }
}

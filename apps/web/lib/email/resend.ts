import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error(
    '[resend] RESEND_API_KEY が設定されていません。環境変数を確認してください。'
  );
}

export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * メール送信元アドレス
 *
 * Stage 1: Resend テストドメイン。
 * Stage 2 でカスタムドメイン認証 (bulr.net) に切り替え。
 */
export const FROM_ADDRESS = 'bulr <onboarding@resend.dev>';

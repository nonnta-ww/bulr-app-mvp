/**
 * apps/candidate の Better Auth インスタンス
 *
 * createAuth factory を使用して、candidate 向けの Magic Link メール送信実装を注入する。
 * apps/candidate 内のすべての auth 参照はこのファイルからインポートすること。
 *
 * Requirements: 1.5, 2.1, 4.1
 */

import { createAuth, type SendMagicLinkFn } from '@bulr/auth/server';
import { sendEmail } from '@bulr/auth/server';
import { renderCandidateMagicLinkEmail } from './magic-link-template';

/**
 * 候補者向け Magic Link メール送信実装。
 * renderCandidateMagicLinkEmail でメール内容を生成し、sendEmail で送信する。
 */
const candidateSendMagicLink: SendMagicLinkFn = async ({ email, url }) => {
  const { subject, html, text } = renderCandidateMagicLinkEmail({ url });
  await sendEmail({ to: email, subject, html, text });
};

/**
 * apps/candidate 用 Better Auth インスタンス（サーバー用）。
 * factory で生成し、candidate 固有の sendMagicLink 実装を注入している。
 */
export const auth = createAuth({ sendMagicLink: candidateSendMagicLink });

/**
 * apps/candidate 用 Better Auth クライアント（クライアント用）。
 * packages/auth の汎用 authClient を再 export する。
 * Better Auth クライアントはサーバー設定（cookie ドメイン・baseURL）を
 * サーバー側で管理するため、アプリ固有の設定は不要。
 */
export { authClient } from '@bulr/auth/client';

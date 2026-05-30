/**
 * apps/admin の Better Auth インスタンス
 *
 * createAuth factory を使用して、admin 向けの Magic Link メール送信実装を注入する。
 * apps/admin 内のすべての auth 参照はこのファイルからインポートすること。
 *
 * Requirements: 1.6, 2.3, 8.2
 */

import { createAuth, type SendMagicLinkFn } from '@bulr/auth/server';
import { sendEmail } from '@bulr/auth/server';
import { renderAdminMagicLinkEmail } from './magic-link-template';

/**
 * 運営向け Magic Link メール送信実装。
 * renderAdminMagicLinkEmail でメール内容を生成し、sendEmail で送信する。
 */
const adminSendMagicLink: SendMagicLinkFn = async ({ email, url }) => {
  const { subject, html, text } = renderAdminMagicLinkEmail({ url });
  await sendEmail({ to: email, subject, html, text });
};

/**
 * apps/admin 用 Better Auth インスタンス。
 * factory で生成し、admin 固有の sendMagicLink 実装を注入している。
 */
export const auth = createAuth({ sendMagicLink: adminSendMagicLink });

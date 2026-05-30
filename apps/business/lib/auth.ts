/**
 * apps/business の Better Auth インスタンス
 *
 * createAuth factory を使用して、business 向けの Magic Link メール送信実装を注入する。
 * apps/business 内のすべての auth 参照はこのファイルからインポートすること。
 *
 * Requirements: 1.6, 2.2, 8.2
 */

import { createAuth, type SendMagicLinkFn } from '@bulr/auth/server';
import { sendEmail } from '@bulr/auth/server';
import { renderBusinessMagicLinkEmail } from './magic-link-template';

/**
 * Business 向け Magic Link メール送信実装。
 * renderBusinessMagicLinkEmail でメール内容を生成し、sendEmail で送信する。
 */
const businessSendMagicLink: SendMagicLinkFn = async ({ email, url }) => {
  const { subject, html, text } = renderBusinessMagicLinkEmail({ url });
  await sendEmail({ to: email, subject, html, text });
};

/**
 * apps/business 用 Better Auth インスタンス。
 * factory で生成し、business 固有の sendMagicLink 実装を注入している。
 */
export const auth = createAuth({ sendMagicLink: businessSendMagicLink });

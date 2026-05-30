/**
 * Better Auth API ルート
 *
 * GET / POST ハンドラを toNextJsHandler で公開する。
 * Magic Link の送信・コールバック・サインアウト等、Better Auth のすべての
 * エンドポイントがこのルートを通じて処理される。
 *
 * Requirements: 1.7, 1.9, 1.10, 3.6
 */

import { auth } from '@bulr/auth/server';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);

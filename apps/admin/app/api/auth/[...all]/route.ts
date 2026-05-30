/**
 * Better Auth API ルート（apps/admin）
 *
 * GET / POST ハンドラを toNextJsHandler で公開する。
 * Magic Link の送信・コールバック・サインアウト等、Better Auth のすべての
 * エンドポイントがこのルートを通じて処理される。
 *
 * apps/business の同名ルートと同パターン。3アプリで `packages/auth` の
 * `auth` インスタンスを共有しており、`user` テーブルも単一。各アプリで
 * `BETTER_AUTH_URL` を独立に設定することで Magic Link コールバック先を
 * 各アプリの URL（admin は :3002）に向ける（design.md セクション 7
 * 「packages/auth > Implementation Notes」参照）。
 *
 * Requirements: 3.2, 3.3
 */

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);

/**
 * Better Auth API ルート（apps/candidate）
 *
 * GET / POST ハンドラを toNextJsHandler で公開する。
 * Magic Link の送信・コールバック・サインアウト等、Better Auth のすべての
 * エンドポイントがこのルートを通じて処理される。
 *
 * apps/admin / apps/business の同名ルートと同パターン。3アプリで
 * `packages/auth` の `auth` インスタンスを共有しており、`user` テーブルも
 * 単一。各アプリで `BETTER_AUTH_URL` を独立に設定することで Magic Link
 * コールバック先を各アプリの URL（candidate は :3000）に向ける
 * （design.md セクション 7「packages/auth > Implementation Notes」参照）。
 *
 * Requirements: 4.2, 4.3
 */

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);

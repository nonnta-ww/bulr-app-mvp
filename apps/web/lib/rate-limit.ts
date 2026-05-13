/**
 * DB ベースのレート制限ユーティリティ。
 *
 * key prefix の用途:
 *   'email:<email>'              : Magic Link メールレート制限（3回/5分）— authentication spec
 *   'ip:<ip>'                    : Magic Link IP ベースレート制限（20回/時）— authentication spec
 *   'session:<userId>:<date>'    : セッション作成レート制限 — assessment-engine spec
 *   'chat:<userId>'              : チャット API レート制限 — assessment-engine spec
 *   'api:<userId>:minute'        : assessment-engine API レート制限（30回/分）
 *   'turn:<sessionId>'           : 1セッション内ターン数制限 — assessment-engine spec
 *   'msg:<sessionId>'            : 1セッション内メッセージ数制限 — assessment-engine spec
 *   'llm:<sessionId>'            : 1セッション内 LLM 呼び出し数制限 — assessment-engine spec
 *
 * ⚠️ Vercel Functions はリクエストごとに独立したプロセスでメモリを共有しない。
 *    in-memory キャッシュ（Map / LRU / グローバル変数など）でカウンタを保持することは禁止。
 *    レート制限カウンタは必ず DB（rate_limit テーブル）に記録すること。
 *
 * 古いレコードのクリーンアップ: Stage 1 では明示的な Cron は実装しない。
 * DB レコード数増加は許容し、Stage 2 で Cron 追加を検討する（Requirement 8.7）。
 */

import { db } from '@bulr/db';
import { sql } from 'drizzle-orm';

/**
 * レート制限超過時に throw されるエラークラス。
 *
 * Better Auth の sendMagicLink ハンドラ内で throw すると、
 * Better Auth が 429 相当の HTTP レスポンスを返す。
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * 指定キーのレート制限カウンタをインクリメントし、制限を超えていれば RateLimitError を throw する。
 *
 * 内部処理:
 *   INSERT INTO rate_limit (key, count, window_start) VALUES (key, 1, now())
 *   ON CONFLICT (key) DO UPDATE SET
 *     count       = (ウィンドウ内なら count+1、ウィンドウ外なら 1 にリセット),
 *     window_start = (ウィンドウ内なら据え置き、ウィンドウ外なら now())
 *   RETURNING count
 *
 * 取得した count が opts.limit を超過した場合に RateLimitError を throw する。
 *
 * @param key      レート制限キー（例: 'email:user@example.com', 'ip:192.168.1.1'）
 * @param opts.limit     ウィンドウ内の最大リクエスト数
 * @param opts.windowMs  ウィンドウ幅（ミリ秒）
 * @throws {RateLimitError} count > limit の場合
 */
export async function checkAndIncrement(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<void> {
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limit (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit.window_start + (${opts.windowMs} * INTERVAL '1 millisecond') > now()
        THEN rate_limit.count + 1
        ELSE 1
      END,
      window_start = CASE
        WHEN rate_limit.window_start + (${opts.windowMs} * INTERVAL '1 millisecond') > now()
        THEN rate_limit.window_start
        ELSE now()
      END
    RETURNING count
  `);

  const count = result.rows[0]?.count ?? 0;
  if (count > opts.limit) {
    throw new RateLimitError(
      `Rate limit exceeded for key prefix: ${key.split(':')[0]}`,
    );
  }
}

/**
 * PostgreSQL エラー判定ユーティリティ。
 *
 * drizzle-orm 0.45 は クエリ失敗を `DrizzleQueryError` でラップする。
 * この wrapper の `.message` は "Failed query: ..." 固定で、PostgreSQL 本来の
 * エラー情報（`code`・`constraint`・"duplicate key ..." メッセージ）は
 * `.cause`（node-postgres の `DatabaseError`）側に格納される。
 *
 * そのため unique 制約違反などは `err.message` ではなく `.cause` チェーンを
 * 辿って判定する必要がある。
 */

/** PostgreSQL の unique_violation エラーコード。 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * エラー（およびその `.cause` チェーン）が PostgreSQL の unique 制約違反かを判定する。
 *
 * @param err 判定対象のエラー（unknown）
 * @param constraint 特定の制約名に限定したい場合に指定。省略時は任意の unique 違反で true。
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  let current: unknown = err;

  // cause チェーンを最大 5 段まで辿る（循環・過剰ネスト対策の上限）
  for (let depth = 0; depth < 5 && current != null; depth++) {
    const e = current as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };

    const isUnique =
      e.code === PG_UNIQUE_VIOLATION ||
      (typeof e.message === 'string' && e.message.includes('duplicate key'));

    if (isUnique) {
      if (!constraint) return true;
      return (
        e.constraint === constraint ||
        (typeof e.message === 'string' && e.message.includes(constraint))
      );
    }

    current = e.cause;
  }

  return false;
}

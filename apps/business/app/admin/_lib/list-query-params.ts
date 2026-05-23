/**
 * 管理画面セッション一覧のクエリパラメータ スキーマ・パーサ
 *
 * Requirements: 2.5, 2.6, 3.5, 3.6
 * Boundary: ListQueryParams
 */

import { z } from 'zod';

// -----------------------------------------------------------------------
// スキーマ定義
// -----------------------------------------------------------------------

export const listQueryParamsSchema = z.object({
  reviewStatus: z.enum(['all', 'pending', 'partial', 'reviewed']).default('all'),
  status: z.enum(['all', 'in_progress', 'completed', 'abandoned']).default('all'),
  sortBy: z.enum(['started_at', 'candidate_name', 'avg_score']).default('started_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListQueryParams = z.infer<typeof listQueryParamsSchema>;

// -----------------------------------------------------------------------
// パーサ
// -----------------------------------------------------------------------

/**
 * Next.js の searchParams (Record<string, string | string[] | undefined>) を
 * ListQueryParams に変換する。
 *
 * 不正な入力はすべてデフォルト値にフォールバックする（fail-secure）。
 * 配列値の場合は先頭要素のみ使用する。
 */
export function parseListQueryParams(
  searchParams: Record<string, string | string[] | undefined>,
): ListQueryParams {
  // 配列値を正規化: 先頭要素のみ取り出す
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      normalized[key] = value[0];
    } else {
      normalized[key] = value;
    }
  }

  const result = listQueryParamsSchema.safeParse(normalized);

  if (!result.success) {
    // 不正入力はデフォルト値にフォールバック (fail-secure)
    return listQueryParamsSchema.parse({});
  }

  return result.data;
}

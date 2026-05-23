/**
 * レビューステータス判定純関数
 *
 * Requirements: 1.3, 2.7
 * Boundary: ReviewStatus
 */

export type ReviewStatus = 'pending' | 'partial' | 'reviewed';

/**
 * pattern_coverage の pending 件数と total 件数からレビューステータスを判定する。
 *
 * - `totalCount === 0 || pendingCount === totalCount` → `'pending'`
 * - `0 < pendingCount && pendingCount < totalCount`   → `'partial'`
 * - `pendingCount === 0 && totalCount > 0`            → `'reviewed'`
 */
export function computeReviewStatus(
  pendingCount: number,
  totalCount: number,
): ReviewStatus {
  if (totalCount === 0 || pendingCount === totalCount) {
    return 'pending';
  }
  if (pendingCount === 0 && totalCount > 0) {
    return 'reviewed';
  }
  // 0 < pendingCount < totalCount
  return 'partial';
}

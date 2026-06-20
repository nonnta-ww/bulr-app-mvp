/**
 * 自己分析の一覧表示ステータスを導出する純関数。
 * 詳細ページの陳腐化判定（answered.submittedAt > record.sourceSubmittedAt）と同一規則。
 *
 * - none : 分析未生成（sourceSubmittedAt が null）
 * - stale: 最新回答が分析生成元より新しい（再生成推奨）
 * - ready: 上記以外（最新の分析あり）
 */
export type AnalysisStatus = 'none' | 'ready' | 'stale';

export function deriveAnalysisStatus(
  latestSubmittedAt: Date,
  analysisSourceSubmittedAt: Date | null,
): AnalysisStatus {
  if (analysisSourceSubmittedAt === null) return 'none';
  if (latestSubmittedAt > analysisSourceSubmittedAt) return 'stale';
  return 'ready';
}

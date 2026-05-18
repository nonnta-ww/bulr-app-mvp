import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';

/**
 * レポート画面が必要とするデータをまとめて取得する。
 * - session_report
 * - そのセッションの interview_turn 全件（ドリルダウンの関連ターン表示用）
 * - assessment_pattern 全件（カバレッジタブの未到達セル表示用）
 */
export async function getReportData(sessionId: string) {
  const [report, allTurns, allPatterns] = await Promise.all([
    db.query.sessionReport.findFirst({
      where: eq(schema.sessionReport.session_id, sessionId),
    }),
    db.query.interviewTurn.findMany({
      where: eq(schema.interviewTurn.session_id, sessionId),
    }),
    db.query.assessmentPattern.findMany({
      where: eq(schema.assessmentPattern.is_active, true),
    }),
  ]);

  return { report, allTurns, allPatterns };
}

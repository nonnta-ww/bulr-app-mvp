import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';

/**
 * レポート画面が必要とするデータをまとめて取得する。
 * - session_report
 * - そのセッションの interview_turn 全件（ドリルダウンの関連ターン表示用）
 * - assessment_pattern 全件（カバレッジタブの未到達セル表示用。過去セッションが現在は
 *   非アクティブなパターンを参照していても表示できるよう、is_active フィルタはかけない）
 */
export async function getReportData(sessionId: string) {
  const [report, allTurns, allPatterns] = await Promise.all([
    db.query.sessionReport.findFirst({
      where: eq(schema.sessionReport.session_id, sessionId),
    }),
    db.query.interviewTurn.findMany({
      where: eq(schema.interviewTurn.session_id, sessionId),
    }),
    db.query.assessmentPattern.findMany(),
  ]);

  return { report, allTurns, allPatterns };
}

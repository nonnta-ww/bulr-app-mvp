/**
 * 既存 session_report.heatmap_data を v2 スキーマに再計算してアップデートする。
 * v1 では LLM が heatmap_data を生成しており overall / patterns が無いので、
 * pattern_coverage + assessment_pattern + interview_turn から再算出する。
 *
 * 実行: pnpm exec tsx scripts/migrate-heatmap-v2.ts
 *
 * このスクリプトは冪等。何度実行しても同じ結果になる。
 */

import { db, schema } from '@bulr/db';
import { aggregateHeatmap } from '@bulr/ai';
import { eq, isNull, and } from 'drizzle-orm';

async function main() {
  const reports = await db.query.sessionReport.findMany();
  console.log(`[migrate] found ${reports.length} session_report rows`);

  const allPatterns = await db.query.assessmentPattern.findMany();
  console.log(`[migrate] loaded ${allPatterns.length} patterns`);

  let updated = 0;
  let skipped = 0;
  for (const report of reports) {
    const sessionId = report.session_id;

    const [allCoverage, freeQuestions, allTurns] = await Promise.all([
      db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      }),
      db.query.interviewTurn.findMany({
        where: and(
          eq(schema.interviewTurn.session_id, sessionId),
          isNull(schema.interviewTurn.pattern_id),
        ),
      }),
      db.query.interviewTurn.findMany({
        where: eq(schema.interviewTurn.session_id, sessionId),
      }),
    ]);

    if (allCoverage.length === 0 && freeQuestions.length === 0) {
      console.log(`[migrate] sessionId=${sessionId}: no coverage/freeQ, skipping`);
      skipped++;
      continue;
    }

    const newHeatmap = aggregateHeatmap({
      allCoverage,
      freeQuestions,
      allPatterns,
      allTurns,
    });

    await db
      .update(schema.sessionReport)
      .set({ heatmap_data: newHeatmap })
      .where(eq(schema.sessionReport.id, report.id));

    console.log(
      `[migrate] sessionId=${sessionId}: updated (patterns=${newHeatmap.patterns.length}, reached=${newHeatmap.overall.reached_count}, stuck=${newHeatmap.overall.stuck_count})`,
    );
    updated++;
  }

  console.log(`[migrate] done. updated=${updated}, skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

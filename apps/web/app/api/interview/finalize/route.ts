import 'server-only';
export const runtime = 'nodejs';

// Requirements 11.1-11.8, 20.2
// _Boundary: FinalizeRoute_

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@bulr/db';
import { schema } from '@bulr/db';
import { createLlmContext } from '@bulr/ai';
import type { HeatmapData } from '@bulr/types/evaluation';
import { buildLlmContext } from '@/lib/queries/build-llm-context';
import { requireUser, requireSessionOwnership } from '@/lib/guards';

// ---------------------------------------------------------------------------
// POST /api/interview/finalize
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // 1. Auth (Requirement 20.2)
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Zod validation: sessionId (Requirement 11.1)
  const inputSchema = z.object({
    sessionId: z.string().min(1),
  });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_failed', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', code: 'INVALID_INPUT', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { sessionId } = parsed.data;

  // 3. Session fetch + requireSessionOwnership (Requirement 20.2)
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, sessionId),
  });
  const sessionOwnershipAdapter = session
    ? { interviewerId: session.interviewer_id }
    : null;
  try {
    requireSessionOwnership(sessionOwnershipAdapter, user.id);
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Build extended LLM context once (Req 7.7, 9.2, 9.4, 23.5).
  // すべての LLM 呼び出しはこの ctx 経由で行う。
  const llm = createLlmContext(
    await buildLlmContext({ session: session!, userId: user.id }),
  );

  // 4. 未完了パターンの抽出と coverage 集約 (Requirements 11.2-11.4)
  //    interview_turn からパターン ID を取得 → pattern_coverage に存在しない patternId を抽出
  //    → 各々について aggregatePatternCoverage 実行 → pattern_coverage UPSERT
  try {
    // interview_turn から patternId がある turn を取得
    const allPatternTurns = await db.query.interviewTurn.findMany({
      where: and(
        eq(schema.interviewTurn.session_id, sessionId),
      ),
      orderBy: [asc(schema.interviewTurn.sequence_no)],
    });

    // 使用された patternId の一覧（null を除く・重複除去）
    const usedPatternIds = [
      ...new Set(
        allPatternTurns
          .map((t) => t.pattern_id)
          .filter((id): id is string => id !== null),
      ),
    ];

    if (usedPatternIds.length > 0) {
      // 既に pattern_coverage に存在するパターン ID を取得
      const allExistingCoverage = await db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      });
      const alreadyCoveredIds = new Set(allExistingCoverage.map((c) => c.pattern_id));
      const uncoveredPatternIds = usedPatternIds.filter((id) => !alreadyCoveredIds.has(id));

      // 未完了パターンごとに aggregatePatternCoverage を実行して UPSERT
      for (const patternId of uncoveredPatternIds) {
        try {
          const pattern = await db.query.assessmentPattern.findFirst({
            where: eq(schema.assessmentPattern.id, patternId),
          });
          if (!pattern) continue;

          const turns = allPatternTurns.filter((t) => t.pattern_id === patternId);
          const llmEvaluation = await llm.aggregatePatternCoverage({
            turns,
            pattern,
          });

          await db
            .insert(schema.patternCoverage)
            .values({
              session_id: sessionId,
              pattern_id: patternId,
              level_reached: llmEvaluation.level_reached,
              stuck_type: llmEvaluation.stuck_type,
              llm_evaluation: llmEvaluation,
              manual_evaluation: null,
              turn_ids: turns.map((t) => t.id),
              finalized_at: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.patternCoverage.session_id, schema.patternCoverage.pattern_id],
              set: {
                level_reached: llmEvaluation.level_reached,
                stuck_type: llmEvaluation.stuck_type,
                llm_evaluation: llmEvaluation,
                turn_ids: turns.map((t) => t.id),
                finalized_at: new Date(),
              },
            });
        } catch (e) {
          console.error(
            `[finalize] aggregatePatternCoverage failed for patternId=${patternId}`,
            e,
          );
          // 個別パターンの失敗は続行
        }
      }
    }
  } catch (e) {
    console.error(`[finalize] uncovered pattern extraction failed for sessionId=${sessionId}`, e);
    // 集約失敗は続行してレポート生成へ
  }

  // 5. 全 pattern_coverage を取得 + フリー質問（patternId=null の interview_turn）を取得
  //    (Requirements 11.5-11.6)
  let allCoverage: typeof schema.patternCoverage.$inferSelect[];
  let freeQuestions: typeof schema.interviewTurn.$inferSelect[];
  try {
    [allCoverage, freeQuestions] = await Promise.all([
      db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      }),
      db.query.interviewTurn.findMany({
        where: and(
          eq(schema.interviewTurn.session_id, sessionId),
          isNull(schema.interviewTurn.pattern_id),
        ),
        orderBy: [asc(schema.interviewTurn.sequence_no)],
      }),
    ]);
  } catch (e) {
    console.error(`[finalize] failed to load coverage/freeQuestions for sessionId=${sessionId}`, e);
    return NextResponse.json({ error: 'data_load_failed', retryable: true }, { status: 503 });
  }

  // 6. レポート生成 (Requirement 11.5)
  // Rebuild ctx so completedCoverage reflects the newly UPSERTed rows from Step 4.
  const reportLlm = createLlmContext(
    await buildLlmContext({ session: session!, userId: user.id }),
  );
  let report: { heatmap_data: HeatmapData; summary_text: string; generated_at: string };
  try {
    report = await reportLlm.generateSessionReport({
      allCoverage,
      freeQuestions,
    });
  } catch (e) {
    console.error(`[finalize] generateSessionReport failed for sessionId=${sessionId}`, e);
    return NextResponse.json({ error: 'report_generation_failed', retryable: true }, { status: 503 });
  }

  // 7. session_report UPSERT + interview_session status 更新 (Requirements 11.7-11.8)
  try {
    await db
      .insert(schema.sessionReport)
      .values({
        session_id: sessionId,
        heatmap_data: report.heatmap_data,
        summary_text: report.summary_text,
        generated_at: new Date(report.generated_at),
      })
      .onConflictDoUpdate({
        target: schema.sessionReport.session_id,
        set: {
          heatmap_data: report.heatmap_data,
          summary_text: report.summary_text,
          generated_at: new Date(report.generated_at),
        },
      });

    await db
      .update(schema.interviewSession)
      .set({ status: 'completed', completed_at: new Date() })
      .where(eq(schema.interviewSession.id, sessionId));
  } catch (e) {
    console.error(`[finalize] DB update failed for sessionId=${sessionId}`, e);
    return NextResponse.json({ error: 'db_update_failed', retryable: true }, { status: 503 });
  }

  // 8. 成功レスポンス (Requirement 11.8)
  return NextResponse.json({
    ok: true,
    redirect: '/interviews/' + sessionId + '/report',
  });
}

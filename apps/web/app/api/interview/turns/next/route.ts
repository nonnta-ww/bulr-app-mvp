import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, lt, max, sql } from 'drizzle-orm';

import { db } from '@bulr/db';
import { schema } from '@bulr/db';
import { createLlmContext, transcribeAudio } from '@bulr/ai';
import { loadRecentTurns } from '@bulr/db/queries';
import { uploadToBlob } from '@/lib/audio/blob-client';
import { buildLlmContext } from '@/lib/queries/build-llm-context';
import { requireUser, requireSessionOwnership } from '@/lib/guards';
import { RateLimitError, checkRateLimit } from '@/lib/rate-limit';
import { TurnsNextEvent } from '@/lib/interview/turns-next-events';

// ---------------------------------------------------------------------------
// withRetry helper
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[turns/next] ${label} failed, retrying once`, e);
    return fn();
  }
}

// ---------------------------------------------------------------------------
// POST /api/interview/turns/next
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // 1. Auth
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Parse formData
  const formData = await request.formData();
  const audio = formData.get('audio') as File | null;
  const turnId = formData.get('turnId') as string | null;
  const sessionId = formData.get('sessionId') as string | null;
  const questionSource = formData.get('questionSource') as string | null;
  const questionText = formData.get('questionText') as string | null;
  const proposalId = formData.get('proposalId') as string | null;
  const patternId = formData.get('patternId') as string | null;
  const durationMs = formData.get('durationMs') as string | null;

  // 3. MIME + size validation
  if (!audio || !(audio instanceof File)) {
    return NextResponse.json({ error: 'audio_required', code: 'MISSING_AUDIO' }, { status: 400 });
  }
  const ALLOWED_MIMES = ['audio/webm', 'audio/mp4', 'audio/wav'];
  // MediaRecorder は 'audio/webm;codecs=opus' のようにパラメータ付きで送ることがある。
  // RFC 7231 に従い、セミコロン以前のベース MIME 部分のみで比較する。
  const baseMime = audio.type.split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_MIMES.includes(baseMime)) {
    return NextResponse.json(
      { error: 'invalid_mime', code: 'INVALID_MIME', details: audio.type },
      { status: 400 },
    );
  }
  const MAX_SIZE = 50 * 1024 * 1024;
  if (audio.size > MAX_SIZE) {
    return NextResponse.json({ error: 'file_too_large', code: 'FILE_TOO_LARGE' }, { status: 400 });
  }

  // 4. Zod validation
  const inputSchema = z.object({
    turnId: z.string().length(21),
    sessionId: z.string().min(1),
    questionSource: z.enum(['llm_candidate_1', 'llm_candidate_2', 'llm_candidate_3', 'manual']),
    questionText: z.string().optional(),
    proposalId: z.string().optional(),
    patternId: z.string().optional(),
    durationMs: z.coerce.number().int().min(0),
  });
  const parsed = inputSchema.safeParse({
    turnId,
    sessionId,
    questionSource,
    questionText: questionText ?? undefined,
    proposalId: proposalId ?? undefined,
    patternId: patternId ?? undefined,
    durationMs,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', code: 'INVALID_INPUT', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 5. Session ownership
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, input.sessionId),
  });
  // requireSessionOwnership expects { interviewerId: string }; adapt snake_case field
  const sessionOwnershipAdapter = session
    ? { interviewerId: session.interviewer_id }
    : null;
  try {
    requireSessionOwnership(sessionOwnershipAdapter, user.id);
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 6. Rate limit pre-check (Req 7.15)
  // Core 処理（LLM 呼び出し等の高コスト処理）に突入する前に読み取りのみで確認し、
  // 超過していれば 429 を即返却する（コスト枯渇攻撃防止）。
  // Core 成功時の実カウントアップは下記の transaction 内で行う。
  const RATE_LIMIT_CHECKS = [
    { key: `api:${user.id}:minute`, limit: 30, windowMs: 60_000 },
    { key: `turn:${input.sessionId}`, limit: 50, windowMs: 86_400_000 },
    { key: `msg:${input.sessionId}`, limit: 200, windowMs: 86_400_000 },
    { key: `llm:${input.sessionId}`, limit: 100, windowMs: 86_400_000 },
  ];
  // QW3: 4 連 sequential read を Promise.all で並列化
  const rlCounts = await Promise.all(
    RATE_LIMIT_CHECKS.map((rl) =>
      checkRateLimit(rl.key, { limit: rl.limit, windowMs: rl.windowMs }),
    ),
  );
  for (let i = 0; i < RATE_LIMIT_CHECKS.length; i++) {
    const rl = RATE_LIMIT_CHECKS[i]!;
    if (rlCounts[i]! >= rl.limit) {
      return NextResponse.json(
        { error: 'rate_limit_exceeded', limit: rl.limit, windowMs: rl.windowMs },
        { status: 429 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // All pre-checks passed. Open SSE stream and run idempotency check + core +
  // prepare phases inside ReadableStream.start().
  // ---------------------------------------------------------------------------

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(event: TurnsNextEvent) {
        const validated = TurnsNextEvent.parse(event);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(validated)}\n\n`));
      }

      // 7. Idempotency check (inside stream)
      const existingTurn = await db.query.interviewTurn.findFirst({
        where: eq(schema.interviewTurn.id, input.turnId),
      });
      if (existingTurn) {
        const [existingProposal, existingCoverage] = await Promise.all([
          db.query.questionProposal.findFirst({
            where: and(
              eq(schema.questionProposal.session_id, input.sessionId),
              eq(schema.questionProposal.prepared_for_turn_no, existingTurn.sequence_no + 1),
            ),
            orderBy: [desc(schema.questionProposal.generated_at)],
          }),
          input.patternId
            ? db.query.patternCoverage.findFirst({
                where: and(
                  eq(schema.patternCoverage.session_id, input.sessionId),
                  eq(schema.patternCoverage.pattern_id, input.patternId),
                ),
              })
            : Promise.resolve(null),
        ]);

        // Emit 4 progress events with 100ms delays so the browser receives
        // them in separate TCP chunks, preventing React 19 auto-batching from
        // collapsing all steps into the final "all complete" render (Req 1.5).
        for (const step of ['upload', 'transcribe', 'analyze', 'prepare'] as const) {
          enqueue({ type: 'progress', step });
          await new Promise<void>((r) => setTimeout(r, 100));
        }
        enqueue({
          type: 'complete',
          turn: existingTurn,
          coverage: existingCoverage ?? null,
          transitionCoverage: null,
          proposal: existingProposal ?? null,
        });
        controller.close();
        return;
      }

      // Core phase
      let insertedTurn: typeof schema.interviewTurn.$inferSelect;
      // analyzeTurn returns LlmAnalysis which now includes matched_pattern_id / stuck_signal
      // directly (M4 fix), so no `as unknown as` casts are needed below.
      let analysisResult: import('@bulr/types/evaluation').LlmAnalysis;
      let effectivePatternId: string | null = null;
      // Hoist the LLM context binder so Prepare phases (transition coverage,
      // completion coverage, next proposals) reuse the same bound ctx (Req 23.5).
      let llm: ReturnType<typeof createLlmContext> | null = null;
      // QW2: currentPattern を関数スコープへ巻き上げ、Prepare-1b で再 fetch せず再利用
      let currentPatternForReuse: typeof schema.assessmentPattern.$inferSelect | null = null;

      try {
        // 10-12. Upload audio
        const ext =
          baseMime === 'audio/webm' ? 'webm' : baseMime === 'audio/mp4' ? 'mp4' : 'wav';
        const audioKey = `interview-turn/${input.sessionId}/${input.turnId}.${ext}`;
        const { audioExpiresAt } = await withRetry(() => uploadToBlob(audio, audioKey), 'uploadToBlob');

        // Progress: upload complete
        enqueue({ type: 'progress', step: 'upload' });

        // 13. Transcribe
        const rawTranscript = await withRetry(() => transcribeAudio(audio), 'transcribeAudio');

        // Progress: transcribe complete
        enqueue({ type: 'progress', step: 'transcribe' });

        // 14. Build extended LLM context once (Req 7.7, 9.2, 9.4, 23.5).
        // currentPattern が指定されていれば取得して ctx に流し込み、Section 12 を実値で構築する。
        const currentPattern = input.patternId
          ? (await db.query.assessmentPattern.findFirst({
              where: eq(schema.assessmentPattern.id, input.patternId),
            })) ?? null
          : null;
        currentPatternForReuse = currentPattern;

        const llmLocal = createLlmContext(
          await buildLlmContext({
            session: session!,
            userId: user.id,
            currentPattern: currentPattern ?? undefined,
          }),
        );
        llm = llmLocal;

        // 15. Speaker separation — `llm.splitInterviewerCandidate` 経由（Req 23.5）
        // QW5: AI SDK 内部で maxRetries: 2 が設定済みのため、外側の withRetry は除去
        const split = await llmLocal.splitInterviewerCandidate({
          transcript: rawTranscript,
          questionTextHint:
            input.questionSource === 'manual' ? null : (input.questionText ?? null),
        });
        const transcript = {
          interviewer: split.interviewer_text,
          candidate: split.candidate_text,
          raw: rawTranscript,
        };

        // 16-18. History + analysis（Req 23.5: `llm.analyzeTurn` 経由）
        const recentTurns = await loadRecentTurns(input.sessionId, 10);
        const history = recentTurns.map((t) => ({
          question: t.question_text,
          answer: (t.transcript as { candidate: string }).candidate,
        }));

        // QW5: AI SDK 内部で maxRetries: 2 が設定済みのため、外側の withRetry は除去
        analysisResult = await llmLocal.analyzeTurn({
          transcript: transcript.candidate,
          currentPattern: currentPattern ?? undefined,
          history,
        });

        // Compute effectivePatternId (Req 24.1, design.md L1300):
        // - off_pattern なら null（pattern_id をクリア）
        // - questionSource === 'manual' の場合は LLM の matched_pattern_id を採用（exact/inferred_high のみ）
        // - それ以外は入力の patternId
        effectivePatternId = (() => {
          if (analysisResult.pattern_match_confidence === 'off_pattern') return null;
          if (input.questionSource === 'manual') {
            return ['exact', 'inferred_high'].includes(analysisResult.pattern_match_confidence)
              ? (analysisResult.matched_pattern_id ?? null)
              : null;
          }
          return input.patternId ?? null;
        })();

        // 19. DB transaction: insert turn + increment rate limit counters atomically (Req 7.15, 7.16)
        const [t] = await db.transaction(async (tx) => {
          // Compute next sequence_no
          const [seqRow] = await tx
            .select({ maxSeq: max(schema.interviewTurn.sequence_no) })
            .from(schema.interviewTurn)
            .where(eq(schema.interviewTurn.session_id, input.sessionId));
          const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

          const rows = await tx
            .insert(schema.interviewTurn)
            .values({
              id: input.turnId,
              session_id: input.sessionId,
              sequence_no: nextSeq,
              // Req 12.3, 24.1: off_pattern なら null をセット。manual の場合は LLM matched 値、それ以外は input.patternId。
              pattern_id: effectivePatternId,
              proposal_id: input.proposalId ?? null,
              question_source: input.questionSource,
              question_text: input.questionText ?? '',
              audio_key: audioKey,
              audio_expires_at: audioExpiresAt,
              transcript,
              llm_analysis: analysisResult,
              // M4: pattern_match_confidence / off_pattern_summary は LlmAnalysis に含まれる
              pattern_match_confidence: analysisResult.pattern_match_confidence,
              off_pattern_summary: analysisResult.off_pattern_summary ?? null,
              duration_ms: input.durationMs,
            })
            .returning();

          // Increment rate limit counters inside the same transaction so that
          // the turn INSERT and counter increments succeed or fail atomically (Req 7.15, 7.16).
          // We inline the SQL using tx (not the module-level db) to stay in the same connection.
          const rateLimitChecks = [
            { key: `api:${user.id}:minute`, limit: 30, windowMs: 60_000 },
            { key: `turn:${input.sessionId}`, limit: 50, windowMs: 86_400_000 },
            { key: `msg:${input.sessionId}`, limit: 200, windowMs: 86_400_000 },
            { key: `llm:${input.sessionId}`, limit: 100, windowMs: 86_400_000 },
          ];
          for (const check of rateLimitChecks) {
            const rlResult = await tx.execute<{ count: number }>(sql`
              INSERT INTO rate_limit (key, count, window_start)
              VALUES (${check.key}, 1, now())
              ON CONFLICT (key) DO UPDATE SET
                count = CASE
                  WHEN rate_limit.window_start + (${check.windowMs} * INTERVAL '1 millisecond') > now()
                  THEN rate_limit.count + 1
                  ELSE 1
                END,
                window_start = CASE
                  WHEN rate_limit.window_start + (${check.windowMs} * INTERVAL '1 millisecond') > now()
                  THEN rate_limit.window_start
                  ELSE now()
                END
              RETURNING count
            `);
            const rlCount = rlResult.rows[0]?.count ?? 0;
            if (rlCount > check.limit) {
              throw new RateLimitError(`Rate limit exceeded for key prefix: ${check.key.split(':')[0]}`);
            }
          }

          return rows;
        });
        if (!t) {
          throw new Error('insert interviewTurn returned no row');
        }
        insertedTurn = t;

        // Progress: analyze + DB insert complete
        enqueue({ type: 'progress', step: 'analyze' });
      } catch (e) {
        // Core failure (including inner RateLimitError from DB transaction).
        // Cannot return HTTP 429 from inside a stream; send error event instead.
        console.error('[turns/next] Core phase failed', e);
        enqueue({ type: 'error', code: 'core_phase_failed', retryable: true });
        controller.close();
        return;
      }

      // Prepare phase (individual try/catch, failures don't abort response)
      // 20. effectivePatternId は Core 内で算出済み（INSERT で適用済み、Req 12.3 / 24.1）

      // 21. Prepare-1a: transition aggregation
      let transitionCoverage: typeof schema.patternCoverage.$inferSelect | null = null;
      try {
        const previousTurn = await db.query.interviewTurn.findFirst({
          where: and(
            eq(schema.interviewTurn.session_id, input.sessionId),
            lt(schema.interviewTurn.sequence_no, insertedTurn.sequence_no),
          ),
          orderBy: [desc(schema.interviewTurn.sequence_no)],
        });
        const transitionDetected =
          previousTurn?.pattern_id != null && previousTurn.pattern_id !== effectivePatternId;
        if (transitionDetected && previousTurn?.pattern_id && llm) {
          const previousPattern = await db.query.assessmentPattern.findFirst({
            where: eq(schema.assessmentPattern.id, previousTurn.pattern_id),
          });
          if (previousPattern) {
            const previousPatternTurns = await db.query.interviewTurn.findMany({
              where: and(
                eq(schema.interviewTurn.session_id, input.sessionId),
                eq(schema.interviewTurn.pattern_id, previousTurn.pattern_id),
              ),
              orderBy: [asc(schema.interviewTurn.sequence_no)],
            });
            // QW5: AI SDK 内部で maxRetries: 2 が設定済みのため、外側の withRetry は除去
            const llmEvaluation = await llm!.aggregatePatternCoverage({
              turns: previousPatternTurns,
              pattern: previousPattern,
            });
            const [tc] = await db
              .insert(schema.patternCoverage)
              .values({
                session_id: input.sessionId,
                pattern_id: previousTurn.pattern_id,
                level_reached: llmEvaluation.level_reached,
                stuck_type: llmEvaluation.stuck_type,
                llm_evaluation: llmEvaluation,
                manual_evaluation: null,
                turn_ids: previousPatternTurns.map((t) => t.id),
                finalized_at: new Date(),
              })
              .onConflictDoUpdate({
                target: [schema.patternCoverage.session_id, schema.patternCoverage.pattern_id],
                set: {
                  level_reached: llmEvaluation.level_reached,
                  stuck_type: llmEvaluation.stuck_type,
                  llm_evaluation: llmEvaluation,
                  turn_ids: previousPatternTurns.map((t) => t.id),
                  finalized_at: new Date(),
                },
              })
              .returning();
            transitionCoverage = tc ?? null;
          }
        }
      } catch (e) {
        console.error('[turns/next] Prepare-1a transition aggregateCov failed', e);
      }

      // 22. Prepare-1b: same-pattern completion aggregation
      let coverage: typeof schema.patternCoverage.$inferSelect | null = null;
      try {
        // QW2: Core phase で取得済みの currentPattern を再利用（再 fetch しない）
        const currentPatternForCoverage = currentPatternForReuse;
        if (
          currentPatternForCoverage &&
          llm &&
          // M4: level_reached_estimate / stuck_signal are now on LlmAnalysis directly
          (analysisResult.level_reached_estimate === 4 || analysisResult.stuck_signal != null)
        ) {
          const turns = await db.query.interviewTurn.findMany({
            where: and(
              eq(schema.interviewTurn.session_id, input.sessionId),
              eq(schema.interviewTurn.pattern_id, currentPatternForCoverage.id),
            ),
            orderBy: [asc(schema.interviewTurn.sequence_no)],
          });
          // QW5: AI SDK 内部で maxRetries: 2 が設定済みのため、外側の withRetry は除去
          const llmEvaluation = await llm!.aggregatePatternCoverage({
            turns,
            pattern: currentPatternForCoverage,
          });
          const [c] = await db
            .insert(schema.patternCoverage)
            .values({
              session_id: input.sessionId,
              pattern_id: currentPatternForCoverage.id,
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
            })
            .returning();
          coverage = c ?? null;
        }
      } catch (e) {
        console.error('[turns/next] Prepare-1b completion aggregateCov failed', e);
      }

      // 23. Prepare-2: next question proposals
      let proposal: typeof schema.questionProposal.$inferSelect | null = null;
      try {
        // QW6: Prepare-1a/1b で新しい coverage 行が insert された場合のみ ctx を再構築する。
        // どちらも発火しなかった場合は既存の llm（= llmLocal）をそのまま再利用して 4 query 分節約。
        const coverageWasUpdated = transitionCoverage !== null || coverage !== null;
        const llmForProposals = coverageWasUpdated
          ? createLlmContext(await buildLlmContext({ session: session!, userId: user.id }))
          : llm;
        if (!llmForProposals) {
          throw new Error('Prepare-2: llm context unavailable');
        }
        // QW1: 件数取得のみが目的なので COUNT(*) で済ませる（最大 1000 行を取得していた箇所）
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, input.sessionId));
        const turnCount = countRow?.count ?? 0;
        // QW5: AI SDK 内部で maxRetries: 2 が設定済みのため、外側の withRetry は除去
        const proposals = await llmForProposals.proposeNextQuestions({
          sessionState: {
            turnCount,
            elapsedMinutes: Math.floor(input.durationMs / 60000),
          },
        });
        const [p] = await db
          .insert(schema.questionProposal)
          .values({
            session_id: input.sessionId,
            prepared_for_turn_no: insertedTurn.sequence_no + 1,
            candidate_1_text: proposals.candidates[0]?.text ?? '',
            candidate_1_intent: proposals.candidates[0]?.intent ?? 'deep_dive',
            candidate_2_text: proposals.candidates[1]?.text ?? '',
            candidate_2_intent: proposals.candidates[1]?.intent ?? 'deep_dive',
            candidate_3_text: proposals.candidates[2]?.text ?? '',
            candidate_3_intent: proposals.candidates[2]?.intent ?? 'next_pattern',
            selected_index: null,
          })
          .returning();
        proposal = p ?? null;
      } catch (e) {
        console.error('[turns/next] Prepare-2 proposeNextQ failed', e);
      }

      // Progress: all prepare phases complete
      enqueue({ type: 'progress', step: 'prepare' });

      // Complete event: includes full payload (turn, coverage, transitionCoverage, proposal)
      enqueue({ type: 'complete', turn: insertedTurn, coverage, transitionCoverage, proposal });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

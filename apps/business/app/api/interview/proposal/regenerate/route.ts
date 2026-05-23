import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@bulr/db';
import { schema } from '@bulr/db';
import { createLlmContext } from '@bulr/ai';
import { loadRecentTurns } from '@bulr/db/queries';
import { buildLlmContext } from '@/lib/queries/build-llm-context';
import { requireUser, requireSessionOwnership } from '@bulr/auth';
import { RateLimitError } from '@bulr/lib';

// ---------------------------------------------------------------------------
// withRetry helper
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[proposal/regenerate] ${label} failed, retrying once`, e);
    return fn();
  }
}

// ---------------------------------------------------------------------------
// Rate limit helpers
// ---------------------------------------------------------------------------

type RateLimitConfig = { key: string; limit: number; windowMs: number };

/**
 * Read-only rate limit check (no increment).
 * Throws RateLimitError if the current count already exceeds the limit.
 */
async function checkRateLimit(config: RateLimitConfig): Promise<void> {
  const result = await db.execute<{ count: number }>(sql`
    SELECT count FROM rate_limit
    WHERE key = ${config.key}
      AND window_start + (${config.windowMs} * INTERVAL '1 millisecond') > now()
  `);
  const count = result.rows[0]?.count ?? 0;
  if (count >= config.limit) {
    throw new RateLimitError(`Rate limit exceeded for key prefix: ${config.key.split(':')[0]}`);
  }
}

/**
 * Increment rate limit counter inside an existing transaction.
 * Throws RateLimitError if the new count exceeds the limit.
 */
async function incrementRateLimitInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  config: RateLimitConfig,
): Promise<void> {
  const rlResult = await tx.execute<{ count: number }>(sql`
    INSERT INTO rate_limit (key, count, window_start)
    VALUES (${config.key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit.window_start + (${config.windowMs} * INTERVAL '1 millisecond') > now()
        THEN rate_limit.count + 1
        ELSE 1
      END,
      window_start = CASE
        WHEN rate_limit.window_start + (${config.windowMs} * INTERVAL '1 millisecond') > now()
        THEN rate_limit.window_start
        ELSE now()
      END
    RETURNING count
  `);
  const count = rlResult.rows[0]?.count ?? 0;
  if (count > config.limit) {
    throw new RateLimitError(`Rate limit exceeded for key prefix: ${config.key.split(':')[0]}`);
  }
}

// ---------------------------------------------------------------------------
// POST /api/interview/proposal/regenerate
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  sessionId: z.string().min(1),
  afterTurnId: z.string().length(21),
});

export async function POST(request: Request): Promise<Response> {
  // 1. Auth
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Parse body + Zod validation
  let input: z.infer<typeof inputSchema>;
  try {
    const body = await request.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_failed', code: 'INVALID_INPUT', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    input = parsed.data;
  } catch {
    return NextResponse.json(
      { error: 'validation_failed', code: 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  // 3. Session ownership
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, input.sessionId),
  });
  const sessionOwnershipAdapter = session
    ? { interviewerId: session.interviewer_id }
    : null;
  try {
    requireSessionOwnership(sessionOwnershipAdapter, user.id);
  } catch (e) {
    // AuthError with code NOT_FOUND → 404, FORBIDDEN → 403
    const code = (e as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 4. afterTurn lookup
  const afterTurn = await db.query.interviewTurn.findFirst({
    where: eq(schema.interviewTurn.id, input.afterTurnId),
  });
  if (!afterTurn || afterTurn.session_id !== input.sessionId) {
    return NextResponse.json({ error: 'turn_not_found' }, { status: 404 });
  }
  const targetTurnNo = afterTurn.sequence_no + 1;

  // 6. Idempotency check (Req 23.4): return existing proposal if already generated
  const existingProposal = await db.query.questionProposal.findFirst({
    where: and(
      eq(schema.questionProposal.session_id, input.sessionId),
      eq(schema.questionProposal.prepared_for_turn_no, targetTurnNo),
    ),
    orderBy: [desc(schema.questionProposal.generated_at)],
  });
  if (existingProposal) {
    return NextResponse.json({ proposal: existingProposal });
  }

  // 7. Rate limit check only (Req 23.3): do not increment yet — only on LLM success
  const rateLimitConfigs = [
    { key: `api:${user.id}:minute`, limit: 30, windowMs: 60_000 },
    { key: `llm:${input.sessionId}`, limit: 100, windowMs: 86_400_000 },
  ];
  try {
    for (const config of rateLimitConfigs) {
      await checkRateLimit(config);
    }
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    }
    throw e;
  }

  // 8. LLM call with 1 retry (Req 23.5)
  // Build extended LLM context (Req 9.2, 9.4) so proposeNextQuestions sees
  // real planned/completed/profile values via buildSystemPrompt.
  const llm = createLlmContext(
    await buildLlmContext({ session: session!, userId: user.id }),
  );
  let proposalResult: Awaited<ReturnType<typeof llm.proposeNextQuestions>>;
  try {
    const turnCount = (await loadRecentTurns(input.sessionId, 1000)).length;

    proposalResult = await withRetry(
      () =>
        llm.proposeNextQuestions({
          sessionState: {
            turnCount,
            elapsedMinutes: 0,
          },
        }),
      'proposeNextQ.regenerate',
    );
  } catch (e) {
    // Req 23.6: LLM failure after retry → 503, do NOT increment rate limit counters
    console.error(
      `[proposal/regenerate] failed sessionId=${input.sessionId} afterTurnId=${input.afterTurnId}`,
      e,
    );
    return NextResponse.json(
      { error: 'proposal_generation_failed', retryable: true },
      { status: 503 },
    );
  }

  // 9. DB transaction: increment rate limit counters + INSERT questionProposal (Req 23.6)
  try {
    const [proposal] = await db.transaction(async (tx) => {
      // Increment rate limit counters atomically with the INSERT
      for (const config of rateLimitConfigs) {
        await incrementRateLimitInTx(tx, config);
      }

      return await tx
        .insert(schema.questionProposal)
        .values({
          session_id: input.sessionId,
          prepared_for_turn_no: targetTurnNo,
          candidate_1_text: proposalResult.candidates[0]?.text ?? '',
          candidate_1_intent: proposalResult.candidates[0]?.intent ?? 'deep_dive',
          candidate_2_text: proposalResult.candidates[1]?.text ?? '',
          candidate_2_intent: proposalResult.candidates[1]?.intent ?? 'deep_dive',
          candidate_3_text: proposalResult.candidates[2]?.text ?? '',
          candidate_3_intent: proposalResult.candidates[2]?.intent ?? 'next_pattern',
          selected_index: null,
        })
        .returning();
    });

    return NextResponse.json({ proposal });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    }
    console.error(
      `[proposal/regenerate] transaction failed sessionId=${input.sessionId} afterTurnId=${input.afterTurnId}`,
      e,
    );
    return NextResponse.json(
      { error: 'proposal_generation_failed', retryable: true },
      { status: 503 },
    );
  }
}

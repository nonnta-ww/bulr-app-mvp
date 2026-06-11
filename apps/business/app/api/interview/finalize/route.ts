import 'server-only';
export const runtime = 'nodejs';

// Requirements 11.1-11.8, 20.2
// task 7.1: finalize ロジックは finalizeSession に委譲（design.md FinalizeExtension）
// _Boundary: FinalizeRoute_

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@bulr/db';
import { schema } from '@bulr/db';
import { requireUser, requireSessionOwnership } from '@bulr/auth/server';
import { finalizeSession } from '@/lib/capture/finalize-session';

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

  // 4. 終了処理のコアロジックに委譲（auth + ownership は上記で保証済み）
  //    userId = session.interviewer_id（requireSessionOwnership で user.id === interviewer_id を確認済み）
  const result = await finalizeSession({
    sessionId,
    userId: session!.interviewer_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...('retryable' in result && result.retryable !== undefined
          ? { retryable: result.retryable }
          : {}),
      },
      { status: result.status },
    );
  }

  // 5. 成功レスポンス (Requirement 11.8)
  return NextResponse.json({
    ok: true,
    redirect: result.redirect,
  });
}

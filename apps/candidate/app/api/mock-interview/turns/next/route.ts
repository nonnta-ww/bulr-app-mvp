/**
 * POST /api/mock-interview/turns/next
 *
 * 模擬面接の次の質問を生成する API ルート。
 *
 * - requireCandidate() で認証・candidateProfileId を取得
 * - Zod でリクエストボディを検証（sessionId, userMessage, history, patternCode）
 * - getMockInterviewByIdAndOwner で所有者確認（不一致は 403）
 * - assessmentPattern をコードで取得（不在は 404）
 * - conductMockInterview で次の質問を生成
 * - incrementMockInterviewTurnCount でターン数を更新
 * - { question, currentLevel, usage } を返す
 *
 * Requirements: 要件3, 要件6, 要件7
 * Boundary: APIRoute
 */

import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db, getMockInterviewByIdAndOwner, incrementMockInterviewTurnCount } from '@bulr/db';
import { assessmentPattern } from '@bulr/db/schema';
import { conductMockInterview } from '@bulr/ai-mock';
import type { TurnItem } from '@bulr/ai-mock';

// ---------------------------------------------------------------------------
// リクエストボディのスキーマ
// ---------------------------------------------------------------------------

const TurnItemSchema = z.object({
  role: z.enum(['interviewer', 'candidate']),
  content: z.string(),
}) satisfies z.ZodType<TurnItem>;

const requestBodySchema = z.object({
  sessionId: z.string().min(1),
  userMessage: z.string().optional(),
  history: z.array(TurnItemSchema),
  patternCode: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. 認証 — requireCandidate で候補者プロファイルを取得
  let candidateProfileId: string;
  try {
    const { candidateProfile: profile } = await requireCandidate();
    candidateProfileId = profile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'unauthorized', code: err.code }, { status: 401 });
    }
    throw err;
  }

  // 2. リクエストボディを JSON パース + Zod 検証
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { sessionId, userMessage, history, patternCode } = parsed.data;

  // 3. 所有者確認 — 不一致（または存在しない）は 403
  const session = await getMockInterviewByIdAndOwner(sessionId, candidateProfileId);
  if (!session) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 4. assessmentPattern をコードで取得
  const [pattern] = await db
    .select()
    .from(assessmentPattern)
    .where(eq(assessmentPattern.code, patternCode))
    .limit(1);

  if (!pattern) {
    return NextResponse.json({ error: 'pattern_not_found', code: patternCode }, { status: 404 });
  }

  // 5. conductMockInterview で次の質問を生成
  const { output, usage } = await conductMockInterview({
    pattern: {
      code: pattern.code,
      title: pattern.title,
      description: pattern.description,
      level_1_intro: pattern.level_1_intro,
      level_2_focus: pattern.level_2_focus,
      level_3_focus: pattern.level_3_focus,
      level_4_focus: pattern.level_4_focus,
      ai_perspective: pattern.ai_perspective,
      signals: pattern.signals,
    },
    history,
    userMessage,
  });

  // 6. ターン数を更新
  await incrementMockInterviewTurnCount(sessionId);

  // 7. レスポンス — question / currentLevel / usage を返す（クライアント累積用）
  return NextResponse.json({
    question: output.next_question,
    currentLevel: output.current_level,
    usage,
  });
}

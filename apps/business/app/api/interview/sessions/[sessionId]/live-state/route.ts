/**
 * GET /api/interview/sessions/[sessionId]/live-state?cursor={segCursor}
 *
 * ポーリング向け差分状態エンドポイント。面接官 UI が 2.5 秒間隔で呼び出し、
 * cursor より大きい seq のセグメントと、カバレッジ進捗・質問候補・経過時間等の
 * 集計済みサイドパネルデータを 1 レスポンスで返す。
 *
 * cursor=0 で全量返却（リロード復元、Req 8.2）。
 * seq は 1-indexed（transcript/route.ts の COALESCE(MAX(seq),0)+1 による）。
 * よって cursor=0 の場合 seq > 0 = 全セグメントとなる。
 *
 * Auth ガード（Req 7.1）:
 *   - requireUser() が throw → 401 Unauthorized
 *   - session が DB に存在しない → 404 Not Found
 *   - session.interviewer_id !== user.id → 403 Forbidden
 *
 * staleTranscript ルール（Req 2.5）:
 *   - capture_status === 'recording' かつ
 *     (last_capture_event_at が null OR 現在時刻から 20 秒超過) の場合に true
 *   - 'bot_joining' は除外（ボット参加中はまだトランスクリプトが来ない正常状態）
 *
 * coverage 分類（Req 3.1）:
 *   - covered:     pattern_coverage 行が存在する
 *   - not_started: pattern_coverage 行が存在しない
 *   - in_progress: 将来拡張用予約（現フェーズでは使用しない）
 *
 * セグメンタ tick（Req 3.3）:
 *   GET に副作用を持たせる例外。capture_status === 'recording' の場合、
 *   レスポンス構築後に runSegmenterTick() を呼び出す（沈黙時計）。
 *
 *   設計上の順序:
 *     1. レスポンスを構築（DB 読み込み → LiveState 構築）
 *     2. tick を実行（try/catch で失敗を吸収）
 *     3. レスポンスを返す
 *
 *   tick はレスポンス生成と独立して実行し（1 で構築済みのレスポンスを返す）、
 *   tick の失敗はレスポンスに影響を与えない（design.md: "応答遅延を避けるため tick は
 *   レスポンス生成と独立に実行する"）。
 *   tick の結果（確定ターン）は次回以降のポーリングで task 4.2 が永続化したあとに
 *   レスポンスに反映される。
 *
 * Requirements: 2.1, 2.5, 3.1, 3.3, 3.8, 7.1, 8.2
 * Design: LiveStateAPI (API Contract / LiveState interface / Requirements Traceability)
 * _Boundary: LiveStateAPI_
 */

import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { requireUser, requireSessionOwnership } from '@bulr/auth/server';
import { LiveStateSchema } from '@/lib/capture/live-state';
import { runSegmenterTick } from '@/lib/capture/segmenter-tick';

// ---------------------------------------------------------------------------
// Zod: cursor クエリパラメータ検証
// ---------------------------------------------------------------------------

const cursorQuerySchema = z.coerce.number().int().gte(0).default(0);

// ---------------------------------------------------------------------------
// GET ハンドラ
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  // ------------------------------------------------------------------
  // 1. 認証（Req 7.1）
  //    requireUser が throw した場合は 401 を返す
  // ------------------------------------------------------------------
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ------------------------------------------------------------------
  // 2. cursor クエリパラメータの検証
  //    デフォルト 0（全量 = リロード復元）
  // ------------------------------------------------------------------
  const url = new URL(request.url);
  const rawCursor = url.searchParams.get('cursor') ?? '0';
  const parsedCursor = cursorQuerySchema.safeParse(rawCursor);
  if (!parsedCursor.success) {
    return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 });
  }
  const cursor = parsedCursor.data;

  // ------------------------------------------------------------------
  // 3. セッション取得と所有権チェック（Req 7.1）
  // ------------------------------------------------------------------
  const { sessionId } = await context.params;

  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, sessionId),
  });

  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    requireSessionOwnership({ interviewerId: session.interviewer_id }, user.id);
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ------------------------------------------------------------------
  // 4. transcript_segment の差分取得（Req 2.1, 8.2）
  //
  //    seq > cursor で差分クエリ。
  //    cursor=0 の場合は seq > 0 = 全セグメント（seq は 1 から始まる）。
  //    順序は seq asc（到着順を保証）。
  // ------------------------------------------------------------------
  const rawSegments = await db.query.transcriptSegment.findMany({
    where: and(
      eq(schema.transcriptSegment.session_id, sessionId),
      gt(schema.transcriptSegment.seq, cursor),
    ),
    orderBy: [asc(schema.transcriptSegment.seq)],
  });

  // ------------------------------------------------------------------
  // 5. pattern_coverage + assessment_pattern の取得（Req 3.1）
  //
  //    planned_pattern_codes は assessment_pattern.code の配列。
  //    pattern_coverage.pattern_id は assessment_pattern.id（nanoid）。
  //    coverage 判定には code → id の変換が必要なため、assessment_pattern を
  //    code IN (planned_pattern_codes) でルックアップする。
  // ------------------------------------------------------------------
  const plannedCodes = session.planned_pattern_codes ?? [];

  const [patternCoverageRows, assessmentPatternRows] = await Promise.all([
    db.query.patternCoverage.findMany({
      where: eq(schema.patternCoverage.session_id, sessionId),
    }),
    plannedCodes.length > 0
      ? db.query.assessmentPattern.findMany({
          where: inArray(schema.assessmentPattern.code, plannedCodes),
        })
      : Promise.resolve([]),
  ]);

  // ------------------------------------------------------------------
  // 6. question_proposal の最新取得（Req 3.2）
  //    最高 prepared_for_turn_no → 同値なら最新 generated_at
  // ------------------------------------------------------------------
  const latestProposal = await db.query.questionProposal.findFirst({
    where: eq(schema.questionProposal.session_id, sessionId),
    orderBy: [
      desc(schema.questionProposal.prepared_for_turn_no),
      desc(schema.questionProposal.generated_at),
    ],
  });

  // ------------------------------------------------------------------
  // 7. LiveState 各フィールドの算出
  // ------------------------------------------------------------------

  const now = Date.now();

  // --- segments (Req 2.1, 8.2) ---
  const segments = rawSegments.map((seg) => ({
    seq: seg.seq,
    speakerRole: seg.speaker_role,
    speakerLabel: seg.speaker_label,
    text: seg.text,
    startedAtMs: seg.started_at_ms,
    endedAtMs: seg.ended_at_ms,
  }));

  // --- nextCursor ---
  const nextCursor =
    segments.length > 0 ? segments[segments.length - 1]!.seq : cursor;

  // --- captureStatus ---
  const captureStatus = session.capture_status;

  // --- staleTranscript (Req 2.5) ---
  // recording 中かつ last_capture_event_at が null または 20 秒超過で true
  const staleThresholdMs = 20_000;
  const isActiveRecording = session.capture_status === 'recording';
  const staleTranscript =
    isActiveRecording &&
    (session.last_capture_event_at === null ||
      now - session.last_capture_event_at.getTime() > staleThresholdMs);

  // --- analysisCapped (Req 4.5) ---
  const analysisCapped = session.analysis_capped_at !== null;

  // --- coverage (Req 3.1) ---
  //
  // 分類ルール（live-state.ts のコメントで詳述）:
  //   covered     = pattern_coverage 行が存在する（pattern_id = assessment_pattern.id）
  //   not_started = pattern_coverage 行が存在しない
  //   in_progress = 将来拡張予約（現フェーズでは使用しない）
  //
  // planned_pattern_codes は assessment_pattern.code（例: "D-01"）を保持する。
  // pattern_coverage.pattern_id は assessment_pattern.id（nanoid）を保持する。
  // そのため code → id のマップを経由して判定する。
  const codeToPatternId = new Map(assessmentPatternRows.map((p) => [p.code, p.id]));
  const coverageByPatternId = new Map(patternCoverageRows.map((r) => [r.pattern_id, r]));

  const coverage = plannedCodes.map((code) => {
    const patternId = codeToPatternId.get(code);
    if (patternId !== undefined) {
      const covRow = coverageByPatternId.get(patternId);
      if (covRow) {
        return {
          patternCode: code,
          status: 'covered' as const,
          levelReached: covRow.level_reached,
        };
      }
    }
    return {
      patternCode: code,
      status: 'not_started' as const,
      levelReached: null,
    };
  });

  // --- currentProposal (Req 3.2) ---
  const currentProposal = latestProposal
    ? {
        candidates: [
          {
            text: latestProposal.candidate_1_text,
            intent: latestProposal.candidate_1_intent,
          },
          {
            text: latestProposal.candidate_2_text,
            intent: latestProposal.candidate_2_intent,
          },
          {
            text: latestProposal.candidate_3_text,
            intent: latestProposal.candidate_3_intent,
          },
        ] as [
          { text: string; intent: string },
          { text: string; intent: string },
          { text: string; intent: string },
        ],
        selectedIndex: latestProposal.selected_index,
      }
    : null;

  // --- elapsedSeconds (Req 3.8) ---
  const elapsedSeconds = session.started_at
    ? Math.floor((now - session.started_at.getTime()) / 1000)
    : 0;

  // --- remainingPlannedPatterns (Req 3.8) ---
  // covered でないコードの数 = covered でない planned_pattern_codes の数
  const coveredCodes = new Set(
    assessmentPatternRows
      .filter((p) => coverageByPatternId.has(p.id))
      .map((p) => p.code),
  );
  const remainingPlannedPatterns = plannedCodes.filter(
    (code) => !coveredCodes.has(code),
  ).length;

  // ------------------------------------------------------------------
  // 8. Zod バリデーションして 200 レスポンスを構築
  //    バリデーション失敗は実装バグを示すため 500 で上位に伝播させる
  // ------------------------------------------------------------------
  const liveState = LiveStateSchema.parse({
    captureStatus,
    staleTranscript,
    analysisCapped,
    segments,
    coverage,
    currentProposal,
    elapsedSeconds,
    remainingPlannedPatterns,
    nextCursor,
  });

  const response = NextResponse.json(liveState);

  // ------------------------------------------------------------------
  // 9. セグメンタ tick（Req 3.3 — GET への例外的副作用）
  //
  //    設計上の順序: レスポンスを先に構築（上の #8）→ tick を実行 → レスポンスを返す。
  //    これにより tick の結果がこのポーリングのレスポンスに混入しない
  //    （確定ターンは task 4.2 が永続化したあとの「次回以降のポーリング」で反映される）。
  //
  //    tick は try/catch で囲み、失敗してもレスポンスには影響させない。
  //    recording 以外は runSegmenterTick 内部で no-op になるが、
  //    呼び出し条件を recording に限定することで余分な DB 読み込みを省く。
  // ------------------------------------------------------------------
  if (isActiveRecording) {
    try {
      await runSegmenterTick({ sessionId });
    } catch (tickError) {
      // tick の失敗はレスポンスに伝播させない（設計: "応答遅延を避けるため tick はレスポンス生成と独立"）
      console.error('[live-state] segmenter tick failed:', tickError);
    }
  }

  return response;
}

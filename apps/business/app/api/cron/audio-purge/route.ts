import 'server-only';
export const runtime = 'nodejs';

import { and, eq, isNotNull, lte } from 'drizzle-orm';

import { db } from '@bulr/db';
import { schema } from '@bulr/db';
import { deleteBlob } from '@/lib/audio/blob-client';

// ---------------------------------------------------------------------------
// GET /api/cron/audio-purge
// Vercel Cron: 0 18 * * * UTC (03:00 JST daily)
// Authorization: Bearer {CRON_SECRET}
// Requirement 16.1-16.8, 7.3, 7.4
//
// Response shape:
//   { deleted, failed, recordingsDeleted, recordingsFailed }
//   - deleted / failed          : interview_turn の purge 件数（既存フィールド、後方互換維持）
//   - recordingsDeleted / recordingsFailed : capture_recording の purge 件数（7.3 追加）
//
// 7.4 保証: transcript_segment / interview_turn 行 / 評価データ（pattern_coverage,
//           session_report）は削除しない。audio_key の null 化のみ行う。
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  // 16.2: Verify Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ---------------------------------------------------------------------------
  // Part 1: interview_turn の期限切れ音声削除（既存パターン）
  // ---------------------------------------------------------------------------

  // 16.3: Fetch expired audio records (audio_key IS NOT NULL AND audio_expires_at <= now())
  const expiredTurns = await db
    .select({
      id: schema.interviewTurn.id,
      audioKey: schema.interviewTurn.audio_key,
      sessionId: schema.interviewTurn.session_id,
    })
    .from(schema.interviewTurn)
    .where(
      and(
        isNotNull(schema.interviewTurn.audio_key),
        lte(schema.interviewTurn.audio_expires_at, new Date()),
      ),
    );

  let deleted = 0;
  let failed = 0;
  const deletedSessionIds: string[] = [];

  // 16.4, 16.5, 16.8: Per-record delete with partial failure tolerance
  for (const row of expiredTurns) {
    try {
      // 16.4: Delete from Vercel Blob
      await deleteBlob(row.audioKey!);

      // 16.5: Update DB — set audio_key = NULL (audio_expires_at retained as history)
      await db
        .update(schema.interviewTurn)
        .set({ audio_key: null })
        .where(eq(schema.interviewTurn.id, row.id));

      deleted++;
      deletedSessionIds.push(row.sessionId);
    } catch (err) {
      // 16.8: Log failure; leave record unchanged so next Cron can retry
      console.error(`[audio-purge] Failed to delete turn audio ${row.audioKey}`, err);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Part 2: capture_recording の期限切れ音声削除（7.3 RetentionExtension 追加）
  //
  // transcript_segment / interview_turn 行 / 評価データは削除しない（7.4）。
  // audio_key を null 化するのみ。行自体と audio_expires_at は削除履歴として保持。
  // ---------------------------------------------------------------------------

  const expiredRecordings = await db
    .select({
      id: schema.captureRecording.id,
      audioKey: schema.captureRecording.audio_key,
      sessionId: schema.captureRecording.session_id,
    })
    .from(schema.captureRecording)
    .where(
      and(
        isNotNull(schema.captureRecording.audio_key),
        lte(schema.captureRecording.audio_expires_at, new Date()),
      ),
    );

  let recordingsDeleted = 0;
  let recordingsFailed = 0;
  const recordingDeletedSessionIds: string[] = [];

  for (const row of expiredRecordings) {
    try {
      // Blob 削除
      await deleteBlob(row.audioKey!);

      // audio_key を null 化（行は残存、audio_expires_at は削除履歴として保持）
      await db
        .update(schema.captureRecording)
        .set({ audio_key: null })
        .where(eq(schema.captureRecording.id, row.id));

      recordingsDeleted++;
      recordingDeletedSessionIds.push(row.sessionId);
    } catch (err) {
      // Partial failure tolerance: ログだけ残して次の Cron でリトライ可能にする
      console.error(`[audio-purge] Failed to delete recording audio ${row.audioKey}`, err);
      recordingsFailed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 16.6: Log summary
  // ---------------------------------------------------------------------------
  console.log(
    `[audio-purge] deleted=${deleted} failed=${failed} total=${expiredTurns.length} sessions=[${[...new Set(deletedSessionIds)].join(',')}]`,
  );
  console.log(
    `[audio-purge] recordingsDeleted=${recordingsDeleted} recordingsFailed=${recordingsFailed} total=${expiredRecordings.length} sessions=[${[...new Set(recordingDeletedSessionIds)].join(',')}]`,
  );

  // 16.7: Return JSON (idempotent — no error even when 0 records)
  return Response.json({ deleted, failed, recordingsDeleted, recordingsFailed });
}

// ---------------------------------------------------------------------------
// POST /api/cron/audio-purge
// Requirement 16.1: GET / POST ハンドラを実装
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}

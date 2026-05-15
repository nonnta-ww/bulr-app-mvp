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
// Requirement 16.1-16.8
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  // 16.2: Verify Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 16.3: Fetch expired audio records (audio_key IS NOT NULL AND audio_expires_at <= now())
  const expired = await db
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
  for (const row of expired) {
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
      console.error(`[audio-purge] Failed to delete ${row.audioKey}`, err);
      failed++;
    }
  }

  // 16.6: Log deleted count, session_id list, failed count
  console.log(
    `[audio-purge] deleted=${deleted} failed=${failed} total=${expired.length} sessions=[${[...new Set(deletedSessionIds)].join(',')}]`,
  );

  // 16.7: Return JSON (idempotent — no error even when 0 records)
  return Response.json({ deleted, failed });
}

// ---------------------------------------------------------------------------
// POST /api/cron/audio-purge
// Requirement 16.1: GET / POST ハンドラを実装
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}

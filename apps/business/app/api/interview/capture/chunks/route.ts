/**
 * POST /api/interview/capture/chunks
 *
 * 対面面接のマイクチャンク音声を受信し、Blob 保存 → 転写 → transcript_segment 生成する。
 *
 * 設計方針（design.md: ChunkIngestion）:
 * - Auth: requireUser（401）+ セッション存在確認（404）+ requireSessionOwnership（403）
 * - multipart FormData: sessionId（string）, chunkNo（int ≥ 0）, audio（File）
 * - MIME 検証: audio/webm / audio/mp4 / audio/wav のベース MIME のみ許可（400）
 * - サイズ検証: ≤ 5MB（413）
 * - レート制限: capture-chunk:<sessionId> 600 回/日（429）
 * - Blob 保存: capture-chunk/{sessionId}/{chunkNo}.{ext}（30 日期限）
 * - capture_recording insert: kind='mic_chunk', chunk_no, audio_key, audio_expires_at
 * - transcribeAudio → 転写テキスト
 * - transcript_segment insert: speaker_role='unknown', origin='mic_chunk',
 *   source_id='mic:{sessionId}:{chunkNo}'（冪等キー）, onConflictDoNothing
 * - seq 割り当て: pg_advisory_xact_lock でセッション単位に直列化（webhook ルートと同パターン）
 * - started_at_ms = chunkNo * 8000, ended_at_ms = (chunkNo + 1) * 8000（8 秒チャンク）
 * - last_capture_event_at を更新（staleTranscript 判定リセット）
 * - 応答: { accepted: true }
 *
 * Requirements: 1.5, 2.7, 7.2
 * Design: ChunkIngestion API Contract / Data Models
 */

import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { transcribeAudio } from '@bulr/ai';
import { uploadToBlob } from '@/lib/audio/blob-client';
import { requireUser, requireSessionOwnership } from '@bulr/auth/server';
import { checkRateLimit, checkAndIncrement } from '@bulr/lib';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const ALLOWED_MIMES = ['audio/webm', 'audio/mp4', 'audio/wav'] as const;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const RATE_LIMIT_KEY_PREFIX = 'capture-chunk';
const RATE_LIMIT_OPTS = { limit: 600, windowMs: 86_400_000 } as const;

// ---------------------------------------------------------------------------
// Zod スキーマ: スカラーフィールド検証
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  sessionId: z.string().min(1),
  chunkNo: z.coerce.number().int().min(0),
});

// ---------------------------------------------------------------------------
// POST ハンドラ
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // ------------------------------------------------------------------
  // 1. Auth: requireUser（401）
  // ------------------------------------------------------------------
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ------------------------------------------------------------------
  // 2. multipart FormData のパース
  // ------------------------------------------------------------------
  const formData = await request.formData();
  const audio = formData.get('audio') as File | null;
  const rawSessionId = formData.get('sessionId') as string | null;
  const rawChunkNo = formData.get('chunkNo') as string | null;

  // audio フィールド存在チェック
  if (!audio || !(audio instanceof File)) {
    return NextResponse.json({ error: 'audio_required', code: 'MISSING_AUDIO' }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 3. MIME 検証（RFC 7231: セミコロン以前のベース MIME で比較）
  // ------------------------------------------------------------------
  const baseMime = audio.type.split(';')[0]!.trim().toLowerCase();
  if (!(ALLOWED_MIMES as readonly string[]).includes(baseMime)) {
    return NextResponse.json(
      { error: 'invalid_mime', code: 'INVALID_MIME', details: audio.type },
      { status: 400 },
    );
  }

  // ------------------------------------------------------------------
  // 4. サイズ検証（≤ 5MB）
  // ------------------------------------------------------------------
  if (audio.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'file_too_large', code: 'FILE_TOO_LARGE' },
      { status: 413 },
    );
  }

  // ------------------------------------------------------------------
  // 5. Zod バリデーション: スカラーフィールド
  // ------------------------------------------------------------------
  const parsed = inputSchema.safeParse({ sessionId: rawSessionId, chunkNo: rawChunkNo });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', code: 'INVALID_INPUT', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { sessionId, chunkNo } = parsed.data;

  // ------------------------------------------------------------------
  // 6. セッション取得（404）+ 所有権確認（403）
  // ------------------------------------------------------------------
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, sessionId),
  });
  try {
    requireSessionOwnership(
      session ? { interviewerId: session.interviewer_id } : null,
      user.id,
    );
  } catch (err) {
    const errCode = (err as { code?: string }).code;
    if (errCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ------------------------------------------------------------------
  // 7. レート制限 pre-check（読み取りのみ）
  //    超過していれば 429 を即返却してコスト枯渇攻撃を防ぐ
  // ------------------------------------------------------------------
  const rlKey = `${RATE_LIMIT_KEY_PREFIX}:${sessionId}`;
  const currentCount = await checkRateLimit(rlKey, RATE_LIMIT_OPTS);
  if (currentCount >= RATE_LIMIT_OPTS.limit) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  // ------------------------------------------------------------------
  // 8. 冪等ガード: 既存 capture_recording を確認
  //
  //    MicChunkRecorder はネットワーク障害時に同一 chunkNo を再送する（正常経路）。
  //    重複 POST が来た場合は Blob 再アップロードと二重 insert を防ぐため、
  //    DB に既存行があればそれを再利用し、9. の Blob 保存／insert をスキップする。
  //
  //    TOCTOU 注記: pg_advisory_xact_lock（手順 11）はセグメント seq 割り当てを
  //    直列化しており、同一セッションへの同時並走 POST はシリアライズされる共通
  //    経路をたどる。厳密な同時重複 POST が発生しても insert 競合は
  //    transcript_segment 側の onConflictDoNothing で吸収されるため許容範囲内。
  // ------------------------------------------------------------------
  const existingRecording = await db.query.captureRecording.findFirst({
    where: and(
      eq(schema.captureRecording.session_id, sessionId),
      eq(schema.captureRecording.chunk_no, chunkNo),
      eq(schema.captureRecording.kind, 'mic_chunk'),
    ),
  });

  let audioKey: string;
  let audioExpiresAt: Date;

  if (existingRecording?.audio_key) {
    // 重複チャンク: 既存レコードを再利用（re-upload / re-insert をスキップ）
    audioKey = existingRecording.audio_key;
    audioExpiresAt = existingRecording.audio_expires_at;
  } else {
    // ------------------------------------------------------------------
    // 9. Blob 保存（2.7）＋ capture_recording insert（新規チャンクのみ）
    //    capture-chunk/{sessionId}/{chunkNo}.{ext}
    // ------------------------------------------------------------------
    const ext =
      baseMime === 'audio/webm' ? 'webm' : baseMime === 'audio/mp4' ? 'mp4' : 'wav';
    const blobKey = `capture-chunk/${sessionId}/${chunkNo}.${ext}`;
    const result = await uploadToBlob(audio, blobKey);
    audioKey = result.audioKey;
    audioExpiresAt = result.audioExpiresAt;

    await db.insert(schema.captureRecording).values({
      session_id: sessionId,
      kind: 'mic_chunk',
      chunk_no: chunkNo,
      audio_key: audioKey,
      audio_expires_at: audioExpiresAt,
    });
  }

  // ------------------------------------------------------------------
  // 10. 転写（1.5）
  //     transcribeAudio で音声 → テキスト
  // ------------------------------------------------------------------
  const transcribedText = await transcribeAudio(audio);

  // ------------------------------------------------------------------
  // 11. transcript_segment insert（冪等）
  //
  //     pg_advisory_xact_lock でセッション単位の seq 割り当てを直列化し、
  //     重複 source_id（mic:{sessionId}:{chunkNo}）は onConflictDoNothing で no-op。
  //
  //     started_at_ms / ended_at_ms: 8 秒チャンク固定スキーム
  //       started_at_ms = chunkNo * 8000
  //       ended_at_ms   = (chunkNo + 1) * 8000
  //
  //     source_id 冪等キー = 'mic:{sessionId}:{chunkNo}'
  //       → 同一チャンクの再送は 1 行にとどまる（設計書 design.md ChunkIngestion）
  //
  // ------------------------------------------------------------------
  const sourceId = `mic:${sessionId}:${chunkNo}`;
  const startedAtMs = chunkNo * 8000;
  const endedAtMs = (chunkNo + 1) * 8000;

  await db.transaction(async (tx) => {
    // セッション ID のハッシュをアドバイザリロックキーとして使用（webhook ルートと同パターン）
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId})::bigint)`,
    );

    // セッション内の次の seq を計算（MAX(seq)+1、行がない場合は 1）
    const seqResult = await tx.execute<{ next_seq: string }>(sql`
      SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
      FROM transcript_segment
      WHERE session_id = ${sessionId}
    `);
    const nextSeq = Number(seqResult.rows[0]?.next_seq ?? 1);

    // (session_id, source_id) が重複する場合は no-op
    await tx
      .insert(schema.transcriptSegment)
      .values({
        session_id: sessionId,
        seq: nextSeq,
        source_id: sourceId,
        speaker_role: 'unknown',
        speaker_label: null,
        text: transcribedText,
        started_at_ms: startedAtMs,
        ended_at_ms: endedAtMs,
        origin: 'mic_chunk',
      })
      .onConflictDoNothing({
        target: [schema.transcriptSegment.session_id, schema.transcriptSegment.source_id],
      });
  });

  // ------------------------------------------------------------------
  // 12. last_capture_event_at を更新（staleTranscript 判定リセット、Req 2.5）
  // ------------------------------------------------------------------
  await db
    .update(schema.interviewSession)
    .set({ last_capture_event_at: new Date() })
    .where(eq(schema.interviewSession.id, sessionId));

  // ------------------------------------------------------------------
  // 13. レート制限インクリメント（core 処理成功後）
  // ------------------------------------------------------------------
  await checkAndIncrement(rlKey, RATE_LIMIT_OPTS);

  // ------------------------------------------------------------------
  // 14. 応答: { accepted: true }
  // ------------------------------------------------------------------
  return NextResponse.json({ accepted: true });
}

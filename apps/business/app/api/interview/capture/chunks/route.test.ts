/**
 * POST /api/interview/capture/chunks の統合テスト（DB バックド）。
 *
 * - blob-client の uploadToBlob と @bulr/ai の transcribeAudio をモック
 * - 実際の Docker Postgres に対して seed/teardown を行う
 * - happy path / 冪等性 / バリデーション / auth ガード / レート制限 を検証する
 *
 * Requirements: 1.5, 2.7, 7.2
 * Design: ChunkIngestion API Contract / Data Models / Testing Strategy Integration Tests #2
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。vitest Node 環境では空モックに置換。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const { TEST_USER_ID, mockRequireUser } = vi.hoisted(() => ({
  TEST_USER_ID: 'chunk-route-test-user-fixed-id',
  mockRequireUser: vi.fn<() => Promise<{ id: string; email: string }>>(),
}));

/**
 * @bulr/auth/server のモック。
 * requireUser を vi.fn() で制御し、requireSessionOwnership は実装互換のスタブを提供する。
 */
vi.mock('@bulr/auth/server', () => {
  class AuthError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = 'AuthError';
      this.code = code;
    }
  }

  function requireSessionOwnership(
    session: { interviewerId: string } | null | undefined,
    userId: string,
  ): void {
    if (!session) throw new AuthError('NOT_FOUND');
    if (session.interviewerId !== userId) throw new AuthError('FORBIDDEN');
  }

  return {
    AuthError,
    requireUser: mockRequireUser,
    requireSessionOwnership,
  };
});

/** blob-client モック: 固定の audioKey と audioExpiresAt（now+30日）を返す */
vi.mock('@/lib/audio/blob-client', () => ({
  uploadToBlob: vi.fn((_audio: Blob, key: string) => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return Promise.resolve({ audioKey: key, audioExpiresAt: expiresAt });
  }),
}));

/** @bulr/ai モック: transcribeAudio は固定テキストを返す */
vi.mock('@bulr/ai', () => ({
  transcribeAudio: vi.fn(() => Promise.resolve('マイクチャンク転写テキスト')),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import { uploadToBlob } from '@/lib/audio/blob-client';
import { POST } from './route';

// ---------------------------------------------------------------------------
// ヘルパー: FormData リクエスト構築
// ---------------------------------------------------------------------------

function makeAudioFile(sizeBytes: number, mimeType = 'audio/webm'): File {
  const buf = new Uint8Array(sizeBytes).fill(0x20);
  return new File([buf], 'chunk.webm', { type: mimeType });
}

function makeRequest(opts: {
  sessionId: string;
  chunkNo: number | string;
  audio: File;
}): Request {
  const formData = new FormData();
  formData.append('sessionId', String(opts.sessionId));
  formData.append('chunkNo', String(opts.chunkNo));
  formData.append('audio', opts.audio, opts.audio.name);
  return new Request('https://example.com/api/interview/capture/chunks', {
    method: 'POST',
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('POST /api/interview/capture/chunks', () => {
  let userId: string;
  let sessionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();

    // デフォルト: 正しいオーナーユーザーを返す
    mockRequireUser.mockResolvedValue({ id: userId, email: `user-${userId}@example.com` });

    // Better Auth ユーザーを挿入
    await db.insert(schema.user).values({
      id: userId,
      email: `test-chunk-${userId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // キャプチャ中のセッションを挿入
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: userId,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'recording',
      capture_provider: 'mic',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();

    // FK 制約に従い子テーブルを先に削除
    await db
      .delete(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    await db
      .delete(schema.captureRecording)
      .where(eq(schema.captureRecording.session_id, sessionId));
    // rate_limit rows（セッション固有キー）をクリーンアップ
    await db
      .delete(schema.rateLimit)
      .where(eq(schema.rateLimit.key, `capture-chunk:${sessionId}`));
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  // =========================================================================
  // (1) ハッピーパス
  // =========================================================================

  it('(1) ハッピーパス: 有効なチャンク → 200 {accepted:true}, capture_recording + transcript_segment 生成, last_capture_event_at 更新', async () => {
    const before = new Date();
    const audio = makeAudioFile(1024, 'audio/webm');
    const req = makeRequest({ sessionId, chunkNo: 0, audio });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { accepted: boolean };
    expect(body.accepted).toBe(true);

    // --- capture_recording 検証 ---
    const recordings = await db.query.captureRecording.findMany({
      where: eq(schema.captureRecording.session_id, sessionId),
    });
    expect(recordings).toHaveLength(1);
    const rec = recordings[0]!;
    expect(rec.kind).toBe('mic_chunk');
    expect(rec.chunk_no).toBe(0);
    expect(rec.audio_key).toBeTruthy();
    // audio_expires_at ≈ now + 30日（±1分の誤差を許容）
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(rec.audio_expires_at.getTime()).toBeGreaterThan(before.getTime() + thirtyDaysMs - 60_000);
    expect(rec.audio_expires_at.getTime()).toBeLessThan(before.getTime() + thirtyDaysMs + 60_000);

    // --- transcript_segment 検証 ---
    const segments = await db.query.transcriptSegment.findMany({
      where: eq(schema.transcriptSegment.session_id, sessionId),
    });
    expect(segments).toHaveLength(1);
    const seg = segments[0]!;
    expect(seg.speaker_role).toBe('unknown');
    expect(seg.origin).toBe('mic_chunk');
    expect(seg.text).toBe('マイクチャンク転写テキスト');
    // source_id = mic:{sessionId}:{chunkNo}
    expect(seg.source_id).toBe(`mic:${sessionId}:0`);
    // started_at_ms / ended_at_ms: chunkNo=0 → 0ms / 8000ms
    expect(seg.started_at_ms).toBe(0);
    expect(seg.ended_at_ms).toBe(8000);

    // --- last_capture_event_at 更新検証 ---
    const session = await db.query.interviewSession.findFirst({
      where: eq(schema.interviewSession.id, sessionId),
    });
    expect(session?.last_capture_event_at).not.toBeNull();
    expect(session!.last_capture_event_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // =========================================================================
  // (2) 冪等性: 同一 sessionId + chunkNo を2回 POST → transcript_segment は 1 行のまま
  // =========================================================================

  it('(2) 冪等性: 同一 sessionId+chunkNo を2回 POST → transcript_segment は 1 行のまま', async () => {
    const audio = makeAudioFile(1024, 'audio/webm');

    const res1 = await POST(makeRequest({ sessionId, chunkNo: 0, audio }));
    expect(res1.status).toBe(200);

    const res2 = await POST(makeRequest({ sessionId, chunkNo: 0, audio }));
    expect(res2.status).toBe(200);

    // transcript_segment は 1 行のまま（source_id 一意制約）
    const [segRow] = await db
      .select({ c: count() })
      .from(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    expect(Number(segRow?.c ?? 0)).toBe(1);

    // capture_recording も 1 行のまま（重複 chunk は re-insert をスキップ）
    const [recRow] = await db
      .select({ c: count() })
      .from(schema.captureRecording)
      .where(eq(schema.captureRecording.session_id, sessionId));
    expect(Number(recRow?.c ?? 0)).toBe(1);

    // uploadToBlob は1回目の POST でのみ呼ばれる（2回目はスキップ）
    expect(vi.mocked(uploadToBlob)).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // (3) サイズ超過: > 5MB → 413, 行生成なし
  // =========================================================================

  it('(3) サイズ超過（5MB超）→ 413, rows なし', async () => {
    const FIVE_MB_PLUS = 5 * 1024 * 1024 + 1;
    const audio = makeAudioFile(FIVE_MB_PLUS, 'audio/webm');
    const req = makeRequest({ sessionId, chunkNo: 0, audio });

    const res = await POST(req);
    expect(res.status).toBe(413);

    const [segRow] = await db
      .select({ c: count() })
      .from(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    expect(Number(segRow?.c ?? 0)).toBe(0);

    const [recRow] = await db
      .select({ c: count() })
      .from(schema.captureRecording)
      .where(eq(schema.captureRecording.session_id, sessionId));
    expect(Number(recRow?.c ?? 0)).toBe(0);
  });

  // =========================================================================
  // (4) 不正 MIME → 400, 行生成なし
  // =========================================================================

  it('(4) 不正 MIME（audio/ogg）→ 400, rows なし', async () => {
    const audio = makeAudioFile(1024, 'audio/ogg');
    const req = makeRequest({ sessionId, chunkNo: 0, audio });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const [segRow] = await db
      .select({ c: count() })
      .from(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    expect(Number(segRow?.c ?? 0)).toBe(0);
  });

  // =========================================================================
  // (5) auth ガード
  // =========================================================================

  it('(5-a) 未認証ユーザー → 401', async () => {
    mockRequireUser.mockRejectedValueOnce(new Error('UNAUTHORIZED'));
    const audio = makeAudioFile(1024);
    const res = await POST(makeRequest({ sessionId, chunkNo: 0, audio }));
    expect(res.status).toBe(401);
  });

  it('(5-b) 存在しないセッション → 404', async () => {
    const unknownSessionId = crypto.randomUUID();
    const audio = makeAudioFile(1024);
    const req = makeRequest({ sessionId: unknownSessionId, chunkNo: 0, audio });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('(5-c) セッション非オーナー → 403', async () => {
    // 別ユーザーをオーナーとして DB に作成
    const otherUserId = crypto.randomUUID();
    await db.insert(schema.user).values({
      id: otherUserId,
      email: `other-${otherUserId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db
      .update(schema.interviewSession)
      .set({ interviewer_id: otherUserId })
      .where(eq(schema.interviewSession.id, sessionId));

    // mockRequireUser は userId（非オーナー）を返したまま → 403
    const audio = makeAudioFile(1024);
    const res = await POST(makeRequest({ sessionId, chunkNo: 0, audio }));
    expect(res.status).toBe(403);

    // 後片付け
    await db
      .update(schema.interviewSession)
      .set({ interviewer_id: userId })
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, otherUserId));
  });

  // =========================================================================
  // (6) レート制限: 600 回/日超過 → 429, 行生成なし
  // =========================================================================

  it('(6) レート制限超過 → 429, rows なし', async () => {
    // capture-chunk:<sessionId> を 600 カウント済みとして pre-seed
    const rlKey = `capture-chunk:${sessionId}`;
    await db
      .insert(schema.rateLimit)
      .values({
        key: rlKey,
        count: 600,
        windowStart: new Date(), // ウィンドウ内（現在時刻）
      })
      .onConflictDoUpdate({
        target: schema.rateLimit.key,
        set: { count: 600, windowStart: new Date() },
      });

    const audio = makeAudioFile(1024);
    const res = await POST(makeRequest({ sessionId, chunkNo: 0, audio }));
    expect(res.status).toBe(429);

    const [segRow] = await db
      .select({ c: count() })
      .from(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    expect(Number(segRow?.c ?? 0)).toBe(0);
  });

  // =========================================================================
  // (7) 1.5 観測可能: 生成セグメントの形状（segmenter/4.2 pending-split 経路用）
  // =========================================================================

  it('(7) 生成セグメントは origin=mic_chunk + speaker_role=unknown (segmenter 経路で消費可能)', async () => {
    const audio = makeAudioFile(512, 'audio/webm;codecs=opus');
    const res = await POST(makeRequest({ sessionId, chunkNo: 3, audio }));
    expect(res.status).toBe(200);

    const segments = await db.query.transcriptSegment.findMany({
      where: eq(schema.transcriptSegment.session_id, sessionId),
    });
    expect(segments).toHaveLength(1);
    const seg = segments[0]!;
    expect(seg.origin).toBe('mic_chunk');
    expect(seg.speaker_role).toBe('unknown');
    // chunkNo=3: started_at_ms=24000, ended_at_ms=32000
    expect(seg.started_at_ms).toBe(24000);
    expect(seg.ended_at_ms).toBe(32000);
    expect(seg.logical_turn_id).toBeNull();
  });

  // =========================================================================
  // (8) codecs パラメータ付き MIME → 400 しない（audio/webm;codecs=opus は受理）
  // =========================================================================

  it('(8) audio/webm;codecs=opus は受理される（200）', async () => {
    const audio = makeAudioFile(1024, 'audio/webm;codecs=opus');
    const res = await POST(makeRequest({ sessionId, chunkNo: 0, audio }));
    expect(res.status).toBe(200);
  });
});

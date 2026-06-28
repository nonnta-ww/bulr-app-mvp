/**
 * POST /api/resume/upload
 *
 * 履歴書アップロード（サーバ経由）。FormData の File をサーバで受け取り、
 * ResumeStorageClient（local-fs / vercel-blob）へ保存して resume_document を INSERT する。
 *
 * Server Action ではなく Route Handler を使う理由:
 * - Server Action はリクエストボディが 1MB（本番でも 4.5MB）に制限され、超過時に
 *   フレームワーク層が 413 を返してエラー画面に落ちる（本対応の発端の不具合）。
 *   Route Handler は Server Action の 1MB 制限を受けず、常に JSON を返せるため
 *   クライアント側で確実にエラーハンドリングできる。
 * - ローカル開発では BLOB_STORAGE_PROVIDER=local-fs によりファイルシステムへ保存され、
 *   Blob トークン無しで動作する（音声機能と同じ規約）。
 *
 * 最大サイズは 4MB。本番 Vercel の Serverless リクエストボディ上限（4.5MB）に収めるため。
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.2
 * Boundary: APIRoute
 */

import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { eq, and, count } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { resumeDocument, resumeKind } from '@bulr/db/schema';

import { getResumeStorage } from '../../../../lib/resume-storage/storage';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB（本番 Serverless 4.5MB 上限に収めるため）

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

// ---------------------------------------------------------------------------
// 型 / スキーマ
// ---------------------------------------------------------------------------

type UploadResponse =
  | { ok: true; id: string }
  | { ok: false; error: { code: string; message: string } };

const inputSchema = z.object({
  kind: z.enum(resumeKind.enumValues),
  file: z.instanceof(File),
});

// ---------------------------------------------------------------------------
// ヘルパー: ファイル名から拡張子を安全に抽出する（パストラバーサル防止）
// ---------------------------------------------------------------------------

function extractSafeExt(filename: string, mimeType: string): string {
  const rawExt = filename.split('.').pop() ?? '';
  const sanitized = rawExt.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  if (sanitized.length > 0 && sanitized.length <= 10) {
    return sanitized;
  }
  return MIME_TO_EXT[mimeType] ?? 'bin';
}

function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json<UploadResponse>({ ok: false, error: { code, message } }, { status });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // Step 1: 認証 + candidateProfile 取得
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message, 401);
    }
    throw err;
  }

  // Step 2: FormData をパース
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail('INVALID_REQUEST', 'リクエストの解析に失敗しました。', 400);
  }

  const parsed = inputSchema.safeParse({
    file: formData.get('file'),
    kind: formData.get('kind'),
  });
  if (!parsed.success) {
    return fail('INVALID_INPUT', parsed.error.issues.map((i) => i.message).join(', '), 400);
  }
  const { file, kind } = parsed.data;

  // Step 3: MIME タイプチェック
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return fail(
      'INVALID_MIME',
      'サポートされていないファイル形式です。PDF・Word（doc/docx）・テキストファイルをアップロードしてください。',
      400,
    );
  }

  // Step 4: サイズチェック
  if (file.size > MAX_SIZE_BYTES) {
    return fail('FILE_TOO_LARGE', 'ファイルサイズは 4MB 以内にしてください。', 400);
  }

  // Step 5: 保存先キーを構築（ext をサニタイズ済み）
  const ext = extractSafeExt(file.name, file.type);
  const key = `candidates/${candidateProfileId}/resumes/${nanoid()}.${ext}`;

  // Step 6: ストレージへ保存（local-fs / vercel-blob）
  const storage = getResumeStorage();
  let stored: Awaited<ReturnType<typeof storage.upload>>;
  try {
    stored = await storage.upload(file, key);
  } catch {
    return fail('BLOB_UPLOAD_FAILED', 'ファイルの保存に失敗しました。再試行してください。', 500);
  }

  // Step 7: 同 kind の既存件数で isPrimary を決定し DB に INSERT
  const newId = nanoid();
  try {
    await db.transaction(async (tx) => {
      const [countResult] = await tx
        .select({ value: count() })
        .from(resumeDocument)
        .where(
          and(
            eq(resumeDocument.candidateProfileId, candidateProfileId),
            eq(resumeDocument.kind, kind),
          ),
        );

      const existingCount = countResult?.value ?? 0;
      const isPrimary = existingCount === 0;

      await tx.insert(resumeDocument).values({
        id: newId,
        candidateProfileId,
        kind,
        isPrimary,
        blobUrl: stored.url,
        blobPathname: stored.pathname,
        mimeType: stored.contentType,
        sizeBytes: stored.size,
        originalFilename: file.name,
      });
    });
  } catch {
    // DB 失敗時は保存済みファイルをベストエフォートで削除してオーファンを防ぐ
    try {
      await storage.delete(stored.pathname);
    } catch {
      // swallow（本番では監視ログ推奨）
    }
    return fail('DB_INSERT_FAILED', 'データベース書き込みに失敗しました。もう一度お試しください。', 500);
  }

  return NextResponse.json<UploadResponse>({ ok: true, id: newId });
}

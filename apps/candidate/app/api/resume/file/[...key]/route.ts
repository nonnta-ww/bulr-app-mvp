/**
 * GET /api/resume/file/{key...}
 *
 * ローカル開発（BLOB_STORAGE_PROVIDER=local-fs）専用の履歴書ファイル配信ルート。
 * 本番（vercel-blob）では blob_url が Vercel Blob を指すためこのルートは使われず、404 を返す。
 *
 * セキュリティ:
 * - requireCandidate() で認証する。
 * - 要求された key（= blob_pathname）が当該候補者所有の resume_document に存在することを
 *   DB で確認してから配信する（所有スコープ外・パストラバーサルを拒否）。
 *
 * Boundary: APIRoute
 */

import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { requireCandidate, AuthError } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { resumeDocument } from '@bulr/db/schema';

import {
  getLocalResumeBaseDir,
  isLocalFsResumeStorage,
} from '../../../../../lib/resume-storage/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  // local-fs モード以外ではこのルートは無効
  if (!isLocalFsResumeStorage()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // 認証
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'unauthorized', code: err.code }, { status: 401 });
    }
    throw err;
  }

  const { key: segments } = await params;
  const key = segments.join('/');

  // パストラバーサル防止
  if (key.includes('..')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // 所有スコープ確認 — 当該候補者の resume_document に存在する pathname のみ配信
  const [doc] = await db
    .select({ mimeType: resumeDocument.mimeType, originalFilename: resumeDocument.originalFilename })
    .from(resumeDocument)
    .where(
      and(
        eq(resumeDocument.blobPathname, key),
        eq(resumeDocument.candidateProfileId, candidateProfileId),
      ),
    )
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // ファイル読み出し
  let buffer: Buffer;
  try {
    buffer = await readFile(join(getLocalResumeBaseDir(), key));
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

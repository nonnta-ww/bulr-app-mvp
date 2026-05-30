'use server';

/**
 * uploadResumeAction — 履歴書アップロード Server Action
 *
 * 候補者が選択したファイルを Vercel Blob に保存し、resume_document を INSERT する。
 *
 * - requireCandidate() でセッション + candidateProfile.id を取得する。
 * - Zod で kind（ResumeKind enum）と file（File 型）を検証する。
 * - MIME タイプと 10MB サイズ上限をサーバーサイドで確認する。
 * - Blob パス: `candidates/{candidateProfileId}/resumes/{nanoid()}.{ext}`
 * - 同 kind・同 candidateProfileId の既存ドキュメント件数で isPrimary を決定する。
 * - 成功時 `{ ok: true, data: { id } }`、失敗時 `{ ok: false, error }` を返す。
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 9.2
 */

import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { eq, and, count } from 'drizzle-orm';

import { requireCandidate } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { resumeDocument, resumeKind } from '@bulr/db/schema';
import { AuthError } from '@bulr/auth/server';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// MIME タイプ → 拡張子のマッピング（fallback 用）
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

// ---------------------------------------------------------------------------
// Zod スキーマ
// ---------------------------------------------------------------------------

const uploadResumeSchema = z.object({
  kind: z.enum(resumeKind.enumValues),
  file: z.instanceof(File),
});

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

type UploadResumeResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// ヘルパー: ファイル名から拡張子を安全に抽出する
// ---------------------------------------------------------------------------

function extractSafeExt(filename: string, mimeType: string): string {
  // 元のファイル名から最後の `.` より後を取得し、英数字とハイフンのみ許可する
  const rawExt = filename.split('.').pop() ?? '';
  const sanitized = rawExt.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();

  // サニタイズ後に有効な拡張子が得られた場合はそれを使用し、そうでなければ MIME マッピングに fallback
  if (sanitized.length > 0 && sanitized.length <= 10) {
    return sanitized;
  }
  return MIME_TO_EXT[mimeType] ?? 'bin';
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

// authedAction wrapper を使わない理由:
// - authedAction は Zod 入力スキーマと typed ctx を提供するが、本 action は FormData + File を
//   受け取るため Zod での厳密な型変換が困難 (z.instanceof(File) は機能するが authedAction の
//   parseInput パイプラインを介さないほうがエラーメッセージが明確)
// - セキュリティ的な等価性は requireCandidate() の内部呼び出しで担保している
//   (candidate-auth-onboarding で確定したパターン: authedAction の有無に関わらず
//   server action 境界で auth ガードを必ず呼ぶ)
export async function uploadResumeAction(formData: FormData): Promise<UploadResumeResult> {
  try {
    // Step 1: 認証 + candidateProfile 取得
    const { candidateProfile } = await requireCandidate();

    // Step 2: FormData から raw 値を抽出して Zod 検証
    const rawFile = formData.get('file');
    const rawKind = formData.get('kind');

    const parsed = uploadResumeSchema.safeParse({ file: rawFile, kind: rawKind });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      };
    }

    const { file, kind } = parsed.data;

    // Step 3: MIME タイプチェック
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_MIME',
          message:
            'サポートされていないファイル形式です。PDF・Word（doc/docx）・テキストファイルをアップロードしてください。',
        },
      };
    }

    // Step 4: ファイルサイズチェック
    if (file.size > MAX_SIZE_BYTES) {
      return {
        ok: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'ファイルサイズは 10MB 以内にしてください。',
        },
      };
    }

    // Step 5: Blob パスを構築（パストラバーサル防止のため ext をサニタイズ済み）
    const ext = extractSafeExt(file.name, file.type);
    const blobId = nanoid();
    const blobPath = `candidates/${candidateProfile.id}/resumes/${blobId}.${ext}`;

    // Step 6: Vercel Blob にアップロード
    // Vercel Blob SDK (@vercel/blob@0.27.3) は access: 'private' をサポートしない (public のみ)。
    // 仕様の「private アクセス」セマンティクスは以下で実現する:
    //   1. nanoid サブパスで URL を non-guessable にする (本ファイル)
    //   2. blob_url を DB のみ保存し、UI は task 3.4 の getSignedUrlAction 経由で
    //      短期 TTL の downloadUrl を受け取る
    //   3. 候補者所有スコープ (requireCandidate + candidate_profile_id 一致) でアクセス制御
    // design.md / requirements.md の "private" 表記は実質的に上記 3 つの組み合わせで実現される意味。
    // （apps/business の storage-vercel-blob.ts と同じパターン）
    let blobResult: Awaited<ReturnType<typeof put>>;
    try {
      blobResult = await put(blobPath, file, {
        access: 'public',
        addRandomSuffix: false,
      });
    } catch {
      return {
        ok: false,
        error: {
          code: 'BLOB_UPLOAD_FAILED',
          message: 'ファイルの保存に失敗しました。再試行してください。',
        },
      };
    }

    // Step 7: 同 kind の既存ドキュメント件数で isPrimary を決定し DB に INSERT
    const newId = nanoid();

    try {
      await db.transaction(async (tx) => {
        // 同 kind・同 candidateProfileId のドキュメント数を取得
        const [countResult] = await tx
          .select({ value: count() })
          .from(resumeDocument)
          .where(
            and(
              eq(resumeDocument.candidateProfileId, candidateProfile.id),
              eq(resumeDocument.kind, kind),
            ),
          );

        const existingCount = countResult?.value ?? 0;
        const isPrimary = existingCount === 0;

        await tx.insert(resumeDocument).values({
          id: newId,
          candidateProfileId: candidateProfile.id,
          kind,
          isPrimary,
          blobUrl: blobResult.url,
          blobPathname: blobResult.pathname,
          mimeType: file.type,
          sizeBytes: file.size,
          originalFilename: file.name,
        });
      });
    } catch {
      // DB 書き込み失敗時は Blob をベストエフォートで削除してオーファンを防ぐ
      // del 失敗はユーザーへのエラー応答に影響させない
      try {
        await del(blobResult.url);
      } catch {
        // swallow — MVP では無視（本番では監視ログへ送出推奨）
      }
      return {
        ok: false,
        error: {
          code: 'DB_INSERT_FAILED',
          message: 'データベース書き込みに失敗しました。もう一度お試しください。',
        },
      };
    }

    return { ok: true, data: { id: newId } };
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
        },
      };
    }
    // 予期しないエラーは再 throw（Next.js の Error Boundary に委譲）
    throw err;
  }
}

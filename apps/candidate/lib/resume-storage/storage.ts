import { createLocalFsResumeStorage } from './storage-local-fs';
import { createVercelBlobResumeStorage } from './storage-vercel-blob';

/**
 * 履歴書ストレージ抽象インターフェイス。
 *
 * apps/business/lib/audio の AudioStorageClient と同じ思想で、本番（Vercel Blob）と
 * ローカル開発（ファイルシステム）を `BLOB_STORAGE_PROVIDER` で切り替える。
 * 履歴書は音声と異なり「ダウンロード（ブラウザへの配信）」も必要なため getDownloadUrl を持つ。
 *
 * - upload: File を保存し、保存結果（url / pathname / size / contentType）を返す
 * - delete: pathname のファイルを削除する（冪等）
 * - getDownloadUrl: ブラウザがダウンロードに使う URL を返す
 *   - local-fs: 認証付きローカル配信ルート（/api/resume/file/...）の URL
 *   - vercel-blob: head() による TTL 付き downloadUrl
 */
export interface ResumeStorageClient {
  upload(
    file: File,
    key: string,
  ): Promise<{ url: string; pathname: string; size: number; contentType: string }>;
  delete(pathname: string): Promise<void>;
  getDownloadUrl(pathname: string): Promise<string>;
}

let cached: ResumeStorageClient | null = null;

/**
 * 現在の環境設定に従って ResumeStorageClient を返す。
 *
 * `BLOB_STORAGE_PROVIDER`:
 *   - `local-fs`: ファイルシステム実装（ローカル開発向け。Blob トークン不要）
 *   - `vercel-blob`（デフォルト）: Vercel Blob 実装
 */
export function getResumeStorage(): ResumeStorageClient {
  if (cached) return cached;

  const provider = process.env.BLOB_STORAGE_PROVIDER ?? 'vercel-blob';
  cached = provider === 'local-fs' ? createLocalFsResumeStorage() : createVercelBlobResumeStorage();
  return cached;
}

/** local-fs 実装が使われているか（ローカル配信ルートの有効/無効判定に使う）。 */
export function isLocalFsResumeStorage(): boolean {
  return (process.env.BLOB_STORAGE_PROVIDER ?? 'vercel-blob') === 'local-fs';
}

/** local-fs の保存先ベースディレクトリ。配信ルートと実装で共有する。 */
export function getLocalResumeBaseDir(): string {
  return process.env.LOCAL_RESUME_DIR ?? './tmp/resumes';
}

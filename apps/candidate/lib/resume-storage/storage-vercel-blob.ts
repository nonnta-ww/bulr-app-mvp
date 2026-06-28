import { put, del, head } from '@vercel/blob';

import type { ResumeStorageClient } from './storage';

/**
 * Vercel Blob による ResumeStorageClient 実装（本番向け）。
 * `BLOB_READ_WRITE_TOKEN` は @vercel/blob SDK が process.env から自動で読み込む。
 *
 * Blob は public アクセスのみ対応のため、「private」セマンティクスは
 *   1. nanoid サブパスで URL を non-guessable にする（呼び出し側で key を生成）
 *   2. blob_url を DB のみ保存し、UI は getDownloadUrl 経由で TTL 付き downloadUrl を受け取る
 *   3. 候補者所有スコープ（requireCandidate + candidate_profile_id 一致）でアクセス制御
 * の組み合わせで実現する。
 */
export function createVercelBlobResumeStorage(): ResumeStorageClient {
  return {
    async upload(file, key) {
      const result = await put(key, file, {
        access: 'public',
        addRandomSuffix: false,
      });
      return {
        url: result.url,
        pathname: result.pathname,
        size: file.size,
        contentType: file.type,
      };
    },

    async delete(pathname) {
      await del(pathname);
    },

    async getDownloadUrl(pathname) {
      const meta = await head(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return meta.downloadUrl;
    },
  };
}

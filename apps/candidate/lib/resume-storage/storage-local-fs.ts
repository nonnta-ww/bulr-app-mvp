import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ResumeStorageClient } from './storage';
import { getLocalResumeBaseDir } from './storage';

/**
 * ファイルシステムベースの ResumeStorageClient 実装（ローカル開発用）。
 *
 * 保存先は `LOCAL_RESUME_DIR`（デフォルト `./tmp/resumes`）。Blob トークン不要でローカル完結する。
 * ダウンロードは認証付き配信ルート `/api/resume/file/{key}` 経由で同じファイルを読み出す。
 * （音声の storage-local-fs.ts と同じ思想。音声と異なりブラウザ配信 URL を返す点が違い。）
 */
export function createLocalFsResumeStorage(): ResumeStorageClient {
  const baseDir = getLocalResumeBaseDir();

  return {
    async upload(file, key) {
      const filepath = join(baseDir, key);
      await mkdir(dirname(filepath), { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filepath, buffer);
      return {
        // ローカル配信ルートの URL。DB の blob_url にそのまま保存される。
        url: `/api/resume/file/${key}`,
        pathname: key,
        size: file.size,
        contentType: file.type,
      };
    },

    async delete(pathname) {
      const filepath = join(baseDir, pathname);
      try {
        await stat(filepath);
        await unlink(filepath);
      } catch (err: unknown) {
        // ファイルが既に無い場合は冪等に成功扱いとする
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },

    async getDownloadUrl(pathname) {
      return `/api/resume/file/${pathname}`;
    },
  };
}

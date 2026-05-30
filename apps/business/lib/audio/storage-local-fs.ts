import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AUDIO_STORAGE_TTL_MS, type AudioStorageClient } from "./storage";

function getBaseDir(): string {
  return process.env.LOCAL_BLOB_DIR ?? "./tmp/audio";
}

/**
 * ファイルシステムベースの AudioStorageClient 実装（ローカル開発用）。
 * 保存先ディレクトリは `LOCAL_BLOB_DIR` 環境変数で指定（デフォルト: `./tmp/audio`）。
 */
export function createLocalFsStorage(): AudioStorageClient {
  const baseDir = getBaseDir();

  return {
    async upload(audio, key) {
      const filepath = join(baseDir, key);
      await mkdir(dirname(filepath), { recursive: true });
      const buffer = Buffer.from(await audio.arrayBuffer());
      await writeFile(filepath, buffer);
      const audioExpiresAt = new Date(Date.now() + AUDIO_STORAGE_TTL_MS);
      return { audioKey: key, audioExpiresAt };
    },
    async delete(key) {
      const filepath = join(baseDir, key);
      try {
        await stat(filepath);
        await unlink(filepath);
      } catch (err: unknown) {
        // ファイルが既に無い場合は idempotent に成功扱いとする
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
    },
  };
}

import { put, del } from "@vercel/blob";
import { AUDIO_STORAGE_TTL_MS, type AudioStorageClient } from "./storage";

/**
 * Vercel Blob による AudioStorageClient 実装。
 * `BLOB_READ_WRITE_TOKEN` は @vercel/blob SDK が process.env から自動で読み込む。
 */
export function createVercelBlobStorage(): AudioStorageClient {
  return {
    async upload(audio, key) {
      await put(key, audio, { access: "public" });
      const audioExpiresAt = new Date(Date.now() + AUDIO_STORAGE_TTL_MS);
      return { audioKey: key, audioExpiresAt };
    },
    async delete(key) {
      await del(key);
    },
  };
}

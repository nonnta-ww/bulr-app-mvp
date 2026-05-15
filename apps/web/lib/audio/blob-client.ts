import { getAudioStorage } from "./storage";

/**
 * 音声 Blob を設定されたストレージプロバイダにアップロードする。
 * プロバイダは `BLOB_STORAGE_PROVIDER`（`local-fs` または `vercel-blob`）で切り替える。
 *
 * @param audio - アップロードする音声 Blob
 * @param key   - ストレージキー（保存パス）
 * @returns audioKey（引数 key と同値）と audioExpiresAt（現在時刻 + 30 日）
 */
export async function uploadToBlob(
  audio: Blob,
  key: string,
): Promise<{ audioKey: string; audioExpiresAt: Date }> {
  return getAudioStorage().upload(audio, key);
}

/**
 * 指定キーのオブジェクトをストレージから削除する。
 *
 * @param key - 削除対象のストレージキー
 */
export async function deleteBlob(key: string): Promise<void> {
  return getAudioStorage().delete(key);
}

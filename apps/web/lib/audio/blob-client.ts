import { put, del } from "@vercel/blob";

/**
 * Uploads an audio Blob to Vercel Blob storage.
 * BLOB_READ_WRITE_TOKEN is read automatically by the @vercel/blob SDK from process.env.
 *
 * @param audio - The audio Blob to upload
 * @param key   - The storage key (path) for the blob
 * @returns audioKey (the key param) and audioExpiresAt (now + 30 days)
 */
export async function uploadToBlob(
  audio: Blob,
  key: string,
): Promise<{ audioKey: string; audioExpiresAt: Date }> {
  await put(key, audio, { access: "public" });

  const audioExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return { audioKey: key, audioExpiresAt };
}

/**
 * Deletes a blob from Vercel Blob storage by key.
 *
 * @param key - The storage key (path) of the blob to delete
 */
export async function deleteBlob(key: string): Promise<void> {
  await del(key);
}

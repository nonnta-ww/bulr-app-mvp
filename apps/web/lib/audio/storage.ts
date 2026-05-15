import { createLocalFsStorage } from "./storage-local-fs";
import { createVercelBlobStorage } from "./storage-vercel-blob";

/**
 * 音声ストレージ抽象インターフェイス。
 * 本番（Vercel Blob）とローカル開発（ファイルシステム）を切り替え可能にする。
 */
export interface AudioStorageClient {
  upload(
    audio: Blob,
    key: string,
  ): Promise<{ audioKey: string; audioExpiresAt: Date }>;
  delete(key: string): Promise<void>;
}

/** 音声保存の TTL（30 日, Req 16）。両プロバイダで共通利用。 */
export const AUDIO_STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let cached: AudioStorageClient | null = null;

/**
 * 現在の環境設定に従って AudioStorageClient を返す。
 *
 * `BLOB_STORAGE_PROVIDER`:
 *   - `local-fs`: ファイルシステム実装（ローカル開発向け）
 *   - `vercel-blob`（デフォルト）: Vercel Blob 実装
 */
export function getAudioStorage(): AudioStorageClient {
  if (cached) return cached;

  const provider = process.env.BLOB_STORAGE_PROVIDER ?? "vercel-blob";

  if (provider === "local-fs") {
    cached = createLocalFsStorage();
  } else {
    cached = createVercelBlobStorage();
  }

  return cached;
}

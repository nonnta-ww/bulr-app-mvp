import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLocalFsResumeStorage } from './storage-local-fs';

/**
 * local-fs 履歴書ストレージの単体テスト。
 * upload→ディスク書き込み / getDownloadUrl→配信ルート URL / delete→削除・冪等 を検証する。
 */
describe('createLocalFsResumeStorage', () => {
  let baseDir: string;
  const KEY = 'candidates/cand_123/resumes/doc_abc.pdf';

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'resume-store-'));
    process.env.LOCAL_RESUME_DIR = baseDir;
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
    delete process.env.LOCAL_RESUME_DIR;
  });

  it('upload はファイルをディスクへ書き込み、配信ルート URL とメタデータを返す', async () => {
    const storage = createLocalFsResumeStorage();
    const bytes = new TextEncoder().encode('%PDF-1.4 dummy resume');
    const file = new File([bytes], '履歴書.pdf', { type: 'application/pdf' });

    const result = await storage.upload(file, KEY);

    expect(result.url).toBe(`/api/resume/file/${KEY}`);
    expect(result.pathname).toBe(KEY);
    expect(result.size).toBe(bytes.byteLength);
    expect(result.contentType).toBe('application/pdf');

    // 実際にディスクへ書かれ、内容が一致する（ネストしたディレクトリも作成される）
    const written = readFileSync(join(baseDir, KEY));
    expect(new Uint8Array(written)).toEqual(bytes);
  });

  it('getDownloadUrl は配信ルートの URL を返す', async () => {
    const storage = createLocalFsResumeStorage();
    await expect(storage.getDownloadUrl(KEY)).resolves.toBe(`/api/resume/file/${KEY}`);
  });

  it('delete はファイルを削除し、存在しない場合も冪等に成功する', async () => {
    const storage = createLocalFsResumeStorage();
    const file = new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' });
    await storage.upload(file, KEY);
    expect(existsSync(join(baseDir, KEY))).toBe(true);

    await storage.delete(KEY);
    expect(existsSync(join(baseDir, KEY))).toBe(false);

    // 2 回目（既に無い）でも例外を投げない
    await expect(storage.delete(KEY)).resolves.toBeUndefined();
  });
});

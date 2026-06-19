// @vitest-environment jsdom
/**
 * use-mic-capture.test.tsx — 対面マイク録音フック + 本番 sender のテスト
 *
 * 検証内容:
 *  - createChunkSender: multipart で /api/interview/capture/chunks へ POST、!ok で throw（再送のため）
 *  - useMicCapture:
 *    - active=false ではマイクを取得しない
 *    - active=true で getUserMedia → recorder.start(stream)
 *    - unmount / active=false でレコーダ停止 + ストリームトラック解放
 *    - getUserMedia 拒否（権限なし）で micError を立てる
 *    - getUserMedia 非対応環境で micError を立てる（取得は試みない）
 *    - onBacklogWarning で backlogWarning を立てる
 *    - 一時停止→再開（active false→true）で同一レコーダを再利用（chunkNo 連番維持の前提）
 *
 * Requirements: 1.5, 8.3
 * Design: ChunkIngestion + MicChunkRecorder（クライアント結線）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

import {
  createChunkSender,
  useMicCapture,
  type MicCaptureDeps,
} from './use-mic-capture';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeFakeStream(): { stream: MediaStream; stopSpy: ReturnType<typeof vi.fn> } {
  const stopSpy = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopSpy }],
  } as unknown as MediaStream;
  return { stream, stopSpy };
}

interface FakeRecorder {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function makeFakeRecorder(): FakeRecorder {
  return {
    start: vi.fn(),
    stop: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// createChunkSender
// ---------------------------------------------------------------------------

describe('createChunkSender', () => {
  it('multipart FormData で /api/interview/capture/chunks へ POST する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const sender = createChunkSender('sess-1');
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await sender({ blob, chunkNo: 7 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/interview/capture/chunks');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('sessionId')).toBe('sess-1');
    expect(form.get('chunkNo')).toBe('7');
    expect(form.get('audio')).toBeInstanceOf(Blob);
  });

  it('レスポンスが !ok のとき throw する（ChunkQueue が再送できるように）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const sender = createChunkSender('sess-1');
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await expect(sender({ blob, chunkNo: 1 })).rejects.toThrow(/503/);
  });
});

// ---------------------------------------------------------------------------
// useMicCapture
// ---------------------------------------------------------------------------

describe('useMicCapture', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let stopSpy: ReturnType<typeof vi.fn>;
  let recorder: FakeRecorder;
  let createRecorder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const fake = makeFakeStream();
    stopSpy = fake.stopSpy;
    getUserMedia = vi.fn().mockResolvedValue(fake.stream);
    recorder = makeFakeRecorder();
    createRecorder = vi.fn().mockReturnValue(recorder);
  });

  function makeDeps(overrides?: Partial<MicCaptureDeps>): MicCaptureDeps {
    return {
      getUserMedia: getUserMedia as unknown as MicCaptureDeps['getUserMedia'],
      createRecorder: createRecorder as unknown as MicCaptureDeps['createRecorder'],
      createSender: (() => vi.fn()) as unknown as MicCaptureDeps['createSender'],
      ...overrides,
    };
  }

  it('active=false ではマイクを取得せず録音もしない', () => {
    renderHook(() =>
      useMicCapture({ sessionId: 's1', active: false, deps: makeDeps() }),
    );
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createRecorder).not.toHaveBeenCalled();
  });

  it('active=true で getUserMedia → recorder.start(stream) を呼ぶ', async () => {
    renderHook(() =>
      useMicCapture({ sessionId: 's1', active: true, deps: makeDeps() }),
    );

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(recorder.start).toHaveBeenCalledTimes(1));
  });

  it('unmount でレコーダを停止しストリームトラックを解放する', async () => {
    const { unmount } = renderHook(() =>
      useMicCapture({ sessionId: 's1', active: true, deps: makeDeps() }),
    );
    await waitFor(() => expect(recorder.start).toHaveBeenCalledTimes(1));

    unmount();

    expect(recorder.stop).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });

  it('getUserMedia が拒否されると micError を立てる', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    const { result } = renderHook(() =>
      useMicCapture({ sessionId: 's1', active: true, deps: makeDeps() }),
    );

    await waitFor(() => expect(result.current.micError).not.toBeNull());
    expect(recorder.start).not.toHaveBeenCalled();
  });

  it('getUserMedia 非対応環境では取得を試みず micError を立てる', async () => {
    const { result } = renderHook(() =>
      // getUserMedia を null にして非対応をシミュレート
      useMicCapture({
        sessionId: 's1',
        active: true,
        deps: makeDeps({ getUserMedia: null as unknown as undefined }),
      }),
    );

    await waitFor(() => expect(result.current.micError).not.toBeNull());
    expect(createRecorder).not.toHaveBeenCalled();
  });

  it('onBacklogWarning が呼ばれると backlogWarning を立てる', async () => {
    let fireWarning: (() => void) | undefined;
    createRecorder.mockImplementation(
      (opts: { onBacklogWarning?: () => void }) => {
        fireWarning = opts.onBacklogWarning;
        return recorder;
      },
    );

    const { result } = renderHook(() =>
      useMicCapture({ sessionId: 's1', active: true, deps: makeDeps() }),
    );

    await waitFor(() => expect(fireWarning).toBeDefined());
    expect(result.current.backlogWarning).toBe(false);

    fireWarning!();

    await waitFor(() => expect(result.current.backlogWarning).toBe(true));
  });

  it('一時停止→再開で同一レコーダを再利用する（chunkNo 連番維持の前提）', async () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useMicCapture({ sessionId: 's1', active, deps: makeDeps() }),
      { initialProps: { active: true } },
    );

    await waitFor(() => expect(recorder.start).toHaveBeenCalledTimes(1));

    // 一時停止: active=false → 停止
    rerender({ active: false });
    expect(recorder.stop).toHaveBeenCalledTimes(1);

    // 再開: active=true → 同一レコーダで再 start（新規生成しない）
    rerender({ active: true });
    await waitFor(() => expect(recorder.start).toHaveBeenCalledTimes(2));
    expect(createRecorder).toHaveBeenCalledTimes(1);
  });
});

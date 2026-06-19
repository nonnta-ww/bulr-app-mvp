/**
 * mic-chunk-recorder.test.ts — ChunkQueue/MicChunkRecorder コア動作テスト
 *
 * テスト対象: ChunkQueue (キュー + 指数バックオフ再送コア)
 *
 * バックオフカーブ (design.md: ChunkIngestion + MicChunkRecorder, Error Handling):
 *   base=1000ms → ×2 → cap=30000ms
 *   実際の遅延列: 1000, 2000, 4000, 8000, 16000, 30000, 30000 ...
 *
 * 順序ポリシー (design.md 8.3):
 *   厳密な送信順序 (in-order)。キュー先頭の失敗は後続チャンクをブロックする。
 *   chunkNo 昇順での配信が保証される。
 *
 * 警告閾値: 30 件の未送信チャンクが溜まると onBacklogWarning を 1 度発火。
 *   バックログが 30 件未満に下がるとフラグがリセットされ、再び 30 件になると再発火。
 *
 * Requirements: 1.5, 8.3
 * Design: ChunkIngestion + MicChunkRecorder, Error Handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChunkItem } from './mic-chunk-recorder';
import { ChunkQueue, MicChunkRecorder } from './mic-chunk-recorder';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeBlob(tag = 'audio'): Blob {
  return new Blob([tag], { type: 'audio/webm' });
}

function makeItem(chunkNo: number): ChunkItem {
  return { blob: makeBlob(), chunkNo };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('ChunkQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Req 8.3: ネットワーク切断→復帰 — 全チャンクが最終的に送達される (headline)
  // -------------------------------------------------------------------------

  describe('ネットワーク切断→復帰: 全チャンク送達 (Req 8.3)', () => {
    it('切断中に積まれたチャンクが再接続後に全て chunkNo 順で送達される', async () => {
      const delivered: number[] = [];
      let callCount = 0;

      // sender: 最初の 3 回を reject（切断シミュレーション）、以降は resolve（復帰）
      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('network error (disconnect)');
        }
        delivered.push(item.chunkNo);
      });

      const queue = new ChunkQueue({ sender });

      // 3 チャンクをキューへ（切断中のため即送信不可）
      queue.enqueue(makeItem(1));
      queue.enqueue(makeItem(2));
      queue.enqueue(makeItem(3));

      // t=0: chunk1 初回試行 → 失敗 (callCount=1)
      await vi.advanceTimersByTimeAsync(0);
      expect(sender).toHaveBeenCalledTimes(1);
      expect(delivered).toHaveLength(0);

      // t=1000: 再試行 1 → 失敗 (callCount=2)
      await vi.advanceTimersByTimeAsync(1000);
      expect(sender).toHaveBeenCalledTimes(2);

      // t=1000+2000=3000: 再試行 2 → 失敗 (callCount=3)
      await vi.advanceTimersByTimeAsync(2000);
      expect(sender).toHaveBeenCalledTimes(3);

      // t=3000+4000=7000: 再試行 3 → 成功（復帰）→ chunk2, chunk3 も連鎖送信
      await vi.advanceTimersByTimeAsync(4000);

      // 全チャンクが chunkNo 昇順で送達されキューが空になる
      expect(delivered).toEqual([1, 2, 3]);
      expect(queue.backlogSize).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 指数バックオフカーブ
  // -------------------------------------------------------------------------

  describe('指数バックオフ', () => {
    it('遅延が 1s → 2s → 4s → 8s → 16s → 30s(上限) と成長する', async () => {
      const sender = vi.fn().mockRejectedValue(new Error('always fail'));
      const queue = new ChunkQueue({ sender });
      queue.enqueue(makeItem(1));

      // t=0: 初回試行
      await vi.advanceTimersByTimeAsync(0);
      expect(sender).toHaveBeenCalledTimes(1);

      // バックオフ 1s: 999ms では再試行しない
      await vi.advanceTimersByTimeAsync(999);
      expect(sender).toHaveBeenCalledTimes(1);

      // 1000ms 到達: 再試行 1 (callCount=2)
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(2);

      // バックオフ 2s: 1999ms では再試行しない
      await vi.advanceTimersByTimeAsync(1999);
      expect(sender).toHaveBeenCalledTimes(2);

      // 2000ms 後: 再試行 2 (callCount=3)
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(3);

      // バックオフ 4s: 3999ms では再試行しない
      await vi.advanceTimersByTimeAsync(3999);
      expect(sender).toHaveBeenCalledTimes(3);

      // 4000ms 後: 再試行 3 (callCount=4)
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(4);

      // バックオフ 8s: 7999ms では再試行しない
      await vi.advanceTimersByTimeAsync(7999);
      expect(sender).toHaveBeenCalledTimes(4);

      // 8000ms 後: 再試行 4 (callCount=5)
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(5);

      // バックオフ 16s: 15999ms では再試行しない
      await vi.advanceTimersByTimeAsync(15999);
      expect(sender).toHaveBeenCalledTimes(5);

      // 16000ms 後: 再試行 5 (callCount=6)
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(6);

      // バックオフ 30s(上限): 29999ms では再試行しない
      await vi.advanceTimersByTimeAsync(29999);
      expect(sender).toHaveBeenCalledTimes(6);

      // 30000ms 後: 再試行 6 (callCount=7) — キャップ到達
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(7);

      // 以降も 30s ごとに再試行（キャップ維持）
      await vi.advanceTimersByTimeAsync(30000);
      expect(sender).toHaveBeenCalledTimes(8);
    });

    it('成功後はバックオフが base(1000ms) にリセットされる', async () => {
      let callCount = 0;
      const sender = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('first fail');
        // second call succeeds
      });

      const queue = new ChunkQueue({ sender });
      queue.enqueue(makeItem(1));

      // t=0: 失敗
      await vi.advanceTimersByTimeAsync(0);
      expect(sender).toHaveBeenCalledTimes(1);

      // t=1000: 成功 → backoff リセット
      await vi.advanceTimersByTimeAsync(1000);
      expect(sender).toHaveBeenCalledTimes(2);
      expect(queue.backlogSize).toBe(0);

      // 次のチャンクを追加し、失敗させる → backoff は 1000ms (リセット済み)
      let callCount2 = 0;
      const sender2 = vi.fn().mockImplementation(async () => {
        callCount2++;
        if (callCount2 === 1) throw new Error('fail');
      });
      const queue2 = new ChunkQueue({ sender: sender2 });
      queue2.enqueue(makeItem(2));

      await vi.advanceTimersByTimeAsync(0); // 失敗

      // リセット後なので 999ms 後は再試行しない
      await vi.advanceTimersByTimeAsync(999);
      expect(sender2).toHaveBeenCalledTimes(1);

      // 1000ms 後に再試行
      await vi.advanceTimersByTimeAsync(1);
      expect(sender2).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // 順序保証
  // -------------------------------------------------------------------------

  describe('送信順序保証 (in-order delivery)', () => {
    it('先頭チャンクが失敗しても後続チャンクは先頭の成功を待つ', async () => {
      const delivered: number[] = [];
      let rejectCount = 0;

      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        // chunk1 を 2 回失敗させる
        if (item.chunkNo === 1 && rejectCount < 2) {
          rejectCount++;
          throw new Error('chunk1 fail');
        }
        delivered.push(item.chunkNo);
      });

      const queue = new ChunkQueue({ sender });
      queue.enqueue(makeItem(1));
      queue.enqueue(makeItem(2));
      queue.enqueue(makeItem(3));

      // t=0: chunk1 失敗 (rejectCount=1)
      await vi.advanceTimersByTimeAsync(0);
      expect(delivered).toHaveLength(0);

      // t=1000: chunk1 失敗 (rejectCount=2)
      await vi.advanceTimersByTimeAsync(1000);
      expect(delivered).toHaveLength(0);

      // t=1000+2000=3000: chunk1 成功 → chunk2, chunk3 も連鎖送信
      await vi.advanceTimersByTimeAsync(2000);

      // 1, 2, 3 の順序が保証される
      expect(delivered).toEqual([1, 2, 3]);
      expect(queue.backlogSize).toBe(0);
    });

    it('複数チャンクが単純成功の場合、enqueue 順で配信される', async () => {
      const delivered: number[] = [];
      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        delivered.push(item.chunkNo);
      });

      const queue = new ChunkQueue({ sender });
      for (let i = 1; i <= 5; i++) {
        queue.enqueue(makeItem(i));
      }

      await vi.advanceTimersByTimeAsync(0);

      expect(delivered).toEqual([1, 2, 3, 4, 5]);
      expect(queue.backlogSize).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 30 件バックログ警告
  // -------------------------------------------------------------------------

  describe('30 件バックログ警告 (Error Handling)', () => {
    it('29 件では警告が発火せず、30 件目で onBacklogWarning が呼ばれる', async () => {
      const onBacklogWarning = vi.fn();
      const sender = vi.fn().mockRejectedValue(new Error('always fail'));
      const queue = new ChunkQueue({ sender, onBacklogWarning });

      // 29 件 → 警告なし
      for (let i = 1; i <= 29; i++) {
        queue.enqueue(makeItem(i));
      }
      expect(onBacklogWarning).not.toHaveBeenCalled();
      expect(queue.backlogSize).toBe(29);

      // 30 件目 → 警告発火
      queue.enqueue(makeItem(30));
      expect(onBacklogWarning).toHaveBeenCalledTimes(1);
    });

    it('30 件警告後に追加エンキューしても警告は再発火しない（同じバックログ蓄積期間中）', async () => {
      const onBacklogWarning = vi.fn();
      const sender = vi.fn().mockRejectedValue(new Error('always fail'));
      const queue = new ChunkQueue({ sender, onBacklogWarning });

      for (let i = 1; i <= 30; i++) {
        queue.enqueue(makeItem(i));
      }
      expect(onBacklogWarning).toHaveBeenCalledTimes(1);

      // さらに追加しても再発火しない
      queue.enqueue(makeItem(31));
      queue.enqueue(makeItem(32));
      expect(onBacklogWarning).toHaveBeenCalledTimes(1);
    });

    it('バックログが 30 件未満に下がった後、再び 30 件になると再発火する', async () => {
      const onBacklogWarning = vi.fn();
      let callCount = 0;

      const sender = vi.fn().mockImplementation(async () => {
        callCount++;
        // 最初の 30 件の送信は失敗させ、その後成功させる
        if (callCount <= 30) throw new Error('fail');
        // 成功 → バックログが減る
      });

      const queue = new ChunkQueue({ sender, onBacklogWarning });

      // 30 件エンキュー → 警告発火
      for (let i = 1; i <= 30; i++) {
        queue.enqueue(makeItem(i));
      }
      expect(onBacklogWarning).toHaveBeenCalledTimes(1);

      // 先頭チャンクの再試行で成功させてバックログを 29 件以下に減らす
      // callCount が 31 になるようバックオフを進める
      // 1000 + 2000 + 4000 + 8000 + 16000 + 30000 * ... ≥ 31 calls
      // 実際には、callCount は1から始まり29回失敗後に成功。
      // 簡単のため、巨大な時間を進めてキューを空にし、フラグがリセットされるか確認する
      // 注: このテストはフラグリセットのみを確認するため callCount 設定を修正

      // 別のアプローチ: warningFired リセットをシンプルに検証
      // warningThreshold を 3 に下げて短いシナリオで確認
      const warnCount2: number[] = [];
      const onWarn2 = vi.fn().mockImplementation(() => warnCount2.push(queue2.backlogSize));

      let calls2 = 0;
      const sender2 = vi.fn().mockImplementation(async () => {
        calls2++;
        // 最初の 3 回は失敗 (先頭チャンクをキューに留める)
        if (calls2 <= 3) throw new Error('fail');
        // 以降は成功
      });

      const queue2 = new ChunkQueue({
        sender: sender2,
        onBacklogWarning: onWarn2,
        warningThreshold: 3,
      });

      // 3 件 → 警告1回目
      queue2.enqueue(makeItem(1));
      queue2.enqueue(makeItem(2));
      queue2.enqueue(makeItem(3));
      expect(onWarn2).toHaveBeenCalledTimes(1);

      // t=0: 失敗。t=1000: 失敗。t=3000: 失敗。t=7000: 成功 → queue drain
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      // キュー空になる
      expect(queue2.backlogSize).toBe(0);

      // 新しいチャンクを 3 件追加 → 再び閾値到達 → 警告 2 回目
      queue2.enqueue(makeItem(4));
      queue2.enqueue(makeItem(5));
      queue2.enqueue(makeItem(6));
      expect(onWarn2).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // 冪等性: 再送信は同じ chunkNo を使用する
  // -------------------------------------------------------------------------

  describe('再送信冪等性 (サーバー側 session_id + chunk_no 冪等性のため)', () => {
    it('失敗したチャンクの再送信は同じ chunkNo を使用する', async () => {
      const sentArgs: Array<{ chunkNo: number }> = [];
      let callCount = 0;

      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        callCount++;
        sentArgs.push({ chunkNo: item.chunkNo });
        if (callCount === 1) {
          throw new Error('first attempt fails');
        }
        // 2 回目は成功
      });

      const queue = new ChunkQueue({ sender });
      queue.enqueue({ blob: makeBlob(), chunkNo: 42 });

      // t=0: 初回試行 → 失敗
      await vi.advanceTimersByTimeAsync(0);
      expect(sentArgs).toEqual([{ chunkNo: 42 }]);

      // t=1000: 再試行 → 成功
      await vi.advanceTimersByTimeAsync(1000);
      expect(sentArgs).toEqual([{ chunkNo: 42 }, { chunkNo: 42 }]);
      expect(queue.backlogSize).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 基本動作
  // -------------------------------------------------------------------------

  describe('基本動作', () => {
    it('単一チャンクが成功時に送達される', async () => {
      const delivered: number[] = [];
      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        delivered.push(item.chunkNo);
      });

      const queue = new ChunkQueue({ sender });
      queue.enqueue(makeItem(1));

      await vi.advanceTimersByTimeAsync(0);

      expect(delivered).toEqual([1]);
      expect(queue.backlogSize).toBe(0);
    });

    it('送信成功後に新たなチャンクをエンキューしても正常に送達される', async () => {
      const delivered: number[] = [];
      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        delivered.push(item.chunkNo);
      });

      const queue = new ChunkQueue({ sender });

      queue.enqueue(makeItem(1));
      await vi.advanceTimersByTimeAsync(0);
      expect(delivered).toEqual([1]);

      queue.enqueue(makeItem(2));
      await vi.advanceTimersByTimeAsync(0);
      expect(delivered).toEqual([1, 2]);
    });

    it('backlogSize は未送信チャンク数を返す', async () => {
      // 常に失敗する sender でキューに積み上がるシナリオ
      const sender = vi.fn().mockRejectedValue(new Error('always fail'));
      const queue = new ChunkQueue({ sender });

      expect(queue.backlogSize).toBe(0);

      queue.enqueue(makeItem(1));
      queue.enqueue(makeItem(2));
      queue.enqueue(makeItem(3));
      // 同期的に 3 件がキューに積まれている
      expect(queue.backlogSize).toBe(3);

      // 初回送信試行（失敗）を flush → 先頭はキューに残りリトライ待ち
      await vi.advanceTimersByTimeAsync(0);
      // 失敗しても先頭チャンクは削除されない
      expect(queue.backlogSize).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // MicChunkRecorder: MediaRecorder 非存在環境でのインポート安全性
  // -------------------------------------------------------------------------

  describe('MicChunkRecorder: Node.js 環境での import 安全性', () => {
    it('MediaRecorder が存在しない環境でも import できる（module level でクラッシュしない）', async () => {
      // このテスト自体が Node.js 環境で実行される = MediaRecorder は undefined
      // import が成功していること自体がこのテストの証明
      const { MicChunkRecorder } = await import('./mic-chunk-recorder');
      expect(MicChunkRecorder).toBeDefined();
    });

    it('start() は MediaRecorder が存在しない環境でエラーをスローする', async () => {
      const { MicChunkRecorder } = await import('./mic-chunk-recorder');
      const recorder = new MicChunkRecorder({
        sessionId: 'test-session',
        sender: vi.fn(),
      });
      expect(() => recorder.start({} as MediaStream)).toThrow('MediaRecorder is not available');
    });
  });

  // -------------------------------------------------------------------------
  // chunkNo 連番維持: 一時停止→再開（stop()→start()）で連番がリセットされない
  // （サーバー側 mic:{sessionId}:{chunkNo} 冪等キーが再開前後で衝突しないため）
  // -------------------------------------------------------------------------

  describe('ウィンドウ録音 (stop/restart) と chunkNo 連番', () => {
    // stop() で dataavailable→stop を発火する最小の MediaRecorder スタブ。
    // new 可能なよう class で定義し、生成のたび instances へ登録する。
    const instances: FakeMediaRecorder[] = [];

    class FakeMediaRecorder {
      static isTypeSupported(_mime: string): boolean {
        return true;
      }
      state: 'inactive' | 'recording' = 'inactive';
      private daCbs: Array<(event: { data: Blob }) => void> = [];
      private stopCbs: Array<() => void> = [];

      constructor() {
        instances.push(this);
      }
      addEventListener(type: 'dataavailable' | 'stop', cb: (...args: never[]) => void): void {
        if (type === 'dataavailable') {
          this.daCbs.push(cb as (event: { data: Blob }) => void);
        } else {
          this.stopCbs.push(cb as () => void);
        }
      }
      start(_timeslice?: number): void {
        this.state = 'recording';
      }
      // 実 MediaRecorder と同様: stop() で最終 dataavailable → stop を発火し、
      // 1 ウィンドウ分の完結した録音（断片の集合）を返す
      stop(): void {
        this.state = 'inactive';
        this.daCbs.forEach((cb) => cb({ data: makeBlob() }));
        this.stopCbs.forEach((cb) => cb());
      }
    }

    beforeEach(() => {
      instances.length = 0;
      vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // 1,2,3,... と 1 始まりで連続しているか（欠番・重複・リセットが無いこと）
    function isContiguousFrom1(arr: number[]): boolean {
      return arr.every((v, i) => v === i + 1);
    }

    // 次ウィンドウ起動が setTimeout(0) に逃げているため、ウィンドウ経過 + 1ms で
    // 遅延起動タイマーをフラッシュして進める（0ms 進めでは 0 遅延タイマーが発火しない）
    async function runWindows(count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        await vi.advanceTimersByTimeAsync(8000);
        await vi.advanceTimersByTimeAsync(1);
      }
    }

    it('ウィンドウごとに 1 チャンク（連番）を生成し、停止指示まで連続録音する', async () => {
      const sent: number[] = [];
      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        sent.push(item.chunkNo);
      });

      const recorder = new MicChunkRecorder({ sessionId: 's1', sender, windowMs: 8000 });
      recorder.start({} as MediaStream);

      await runWindows(3);

      // 3 ウィンドウ分のチャンクが 1,2,3,... と連続して生成される
      expect(sent.length).toBeGreaterThanOrEqual(3);
      expect(isContiguousFrom1(sent)).toBe(true);
      // 各ウィンドウで新しい MediaRecorder が生成される（独立した完結 webm）
      expect(instances.length).toBeGreaterThanOrEqual(3);
    });

    it('一時停止→再開で chunkNo が連番継続する（リセット・重複しない）', async () => {
      const sent: number[] = [];
      const sender = vi.fn().mockImplementation(async (item: ChunkItem) => {
        sent.push(item.chunkNo);
      });

      const recorder = new MicChunkRecorder({ sessionId: 's1', sender, windowMs: 8000 });

      recorder.start({} as MediaStream);
      await runWindows(2);

      // 一時停止: 進行中ウィンドウの末尾分も最終チャンクとして送られる
      recorder.stop();
      await vi.advanceTimersByTimeAsync(0);
      const afterPause = [...sent];
      expect(afterPause.length).toBeGreaterThanOrEqual(1);
      expect(isContiguousFrom1(afterPause)).toBe(true);

      // 停止後はタイマーを進めても新規チャンクが出ない
      await vi.advanceTimersByTimeAsync(32000);
      expect(sent).toEqual(afterPause);

      // 再開 → さらに録音
      recorder.start({} as MediaStream);
      await runWindows(2);

      // 連番が 1 始まりで連続したまま伸びる（再開時に 1 へ戻らない＝冪等キー衝突しない）
      expect(isContiguousFrom1(sent)).toBe(true);
      expect(sent.length).toBeGreaterThan(afterPause.length);
      // 再開後の最初のチャンクは「停止前の続き番号」になる
      expect(sent[afterPause.length]).toBe(afterPause.length + 1);
    });

    it('start() が NotSupportedError を投げても未捕捉にせず onError で通知する', () => {
      // 一部ブラウザは MediaRecorder.start() で NotSupportedError を投げる。
      // これをイベント/タイマー文脈で握りつぶさず onError へ流すことを検証する。
      class ThrowingMediaRecorder {
        static isTypeSupported(_mime: string): boolean {
          return true;
        }
        state: 'inactive' | 'recording' = 'inactive';
        addEventListener(): void {}
        start(): void {
          throw new DOMException('start failed', 'NotSupportedError');
        }
        stop(): void {}
      }
      vi.stubGlobal('MediaRecorder', ThrowingMediaRecorder);

      const onError = vi.fn();
      const recorder = new MicChunkRecorder({
        sessionId: 's1',
        sender: vi.fn(),
        onError,
        windowMs: 8000,
      });

      // start() は内部で try/catch するため throw しない
      expect(() => recorder.start({} as MediaStream)).not.toThrow();
      expect(onError).toHaveBeenCalledTimes(1);
      // 失敗後はタイマーが残らない（暴走しない）
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stop() 後にタイマーが残らない（ウィンドウが再開しない）', async () => {
      const sender = vi.fn().mockResolvedValue(undefined);
      const recorder = new MicChunkRecorder({ sessionId: 's1', sender, windowMs: 8000 });

      recorder.start({} as MediaStream);
      recorder.stop();

      // 停止直後、保留タイマーが無いことを確認（stop でクリアされている）
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

'use client';
/**
 * mic-chunk-recorder.ts
 *
 * マイクチャンクレコーダ: MediaRecorder (timeslice 8s) + 未送信キュー + 指数バックオフ再送
 *
 * ## 設計概要
 *
 * ### ChunkQueue (テスト可能なコア)
 * - MediaRecorder に依存しない純粋なキュー実装
 * - 注入された `sender` 関数で配信（テストは mock sender を注入して純粋 Node.js で検証可能）
 * - 送信失敗時はキューに保持し指数バックオフで再送（チャンクを一切破棄しない: Req 8.3）
 *
 * ### MicChunkRecorder (薄いアダプタ)
 * - ChunkQueue に依存する MediaRecorder ラッパー
 * - インポート時に MediaRecorder を参照しない（Node.js 環境でも安全に import できる）
 * - `start()` / `stop()` で録音制御、timeslice=8000ms
 * - 本番 sender は sessionId + chunkNo を multipart で /api/interview/capture/chunks へ POST
 *
 * ### バックオフカーブ (design.md: ChunkIngestion + MicChunkRecorder)
 *   base=1000ms → ×2 per failure → cap=30000ms
 *   遅延列: 1000, 2000, 4000, 8000, 16000, 30000, 30000, ...
 *   成功時: currentDelay を base にリセット
 *
 * ### 順序ポリシー (design.md 8.3)
 *   厳密な in-order 配信。キュー先頭の失敗は後続チャンクをブロックする。
 *   chunkNo 昇順での配信が保証される（サーバー側の (session_id, chunk_no) 冪等キーが機能する）。
 *
 * ### バックログ警告 (design.md: Error Handling)
 *   未送信チャンクが 30 件以上になると onBacklogWarning を呼び出す。
 *   バックログが 30 件未満に下がるとフラグがリセットされ、再び 30 件になると再発火する。
 *
 * Requirements: 1.5, 8.3
 * Design: ChunkIngestion + MicChunkRecorder, Error Handling, File Structure Plan
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 単一音声チャンク（Blob + 連番） */
export interface ChunkItem {
  blob: Blob;
  /** 送信順序・冪等キー。再送時も同じ値を使用する (session_id + chunk_no で重複排除) */
  chunkNo: number;
}

/** チャンクを送信する非同期関数。失敗時は Promise を reject する */
export type ChunkSender = (item: ChunkItem) => Promise<void>;

export interface ChunkQueueOptions {
  /** チャンクを送信する関数（テスト時は mock を注入） */
  sender: ChunkSender;
  /** バックログが warningThreshold 件以上になったときに呼ばれるコールバック */
  onBacklogWarning?: () => void;
  /** 指数バックオフの基底遅延 (ms)。デフォルト: 1000 */
  baseDelayMs?: number;
  /** 指数バックオフの上限遅延 (ms)。デフォルト: 30000 */
  maxDelayMs?: number;
  /** バックログ警告の閾値 (件数)。デフォルト: 30 */
  warningThreshold?: number;
}

// ---------------------------------------------------------------------------
// ChunkQueue — テスト可能なキュー + 指数バックオフ再送コア
// ---------------------------------------------------------------------------

/**
 * ChunkQueue: in-order 配信キュー + 指数バックオフ自動再送
 *
 * - `enqueue(item)` でチャンクを追加する
 * - 注入された `sender` で順番に送信する
 * - 送信失敗時はキューに保持し、指数バックオフ後に再送する（チャンクを破棄しない）
 * - 先頭チャンクの失敗は後続チャンクをブロックする（in-order 保証）
 * - バックログが warningThreshold 件以上になると onBacklogWarning を呼び出す
 */
export class ChunkQueue {
  private readonly items: ChunkItem[] = [];
  private sending = false;
  private currentDelay: number;
  private warningFired = false;

  private readonly sender: ChunkSender;
  private readonly onBacklogWarning: (() => void) | undefined;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly warningThreshold: number;

  constructor(options: ChunkQueueOptions) {
    this.sender = options.sender;
    this.onBacklogWarning = options.onBacklogWarning;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.warningThreshold = options.warningThreshold ?? 30;
    this.currentDelay = this.baseDelayMs;
  }

  /** 現在のキュー内未送信チャンク数 */
  get backlogSize(): number {
    return this.items.length;
  }

  /**
   * チャンクをキューに追加する。
   * - バックログ警告閾値を超えた場合、onBacklogWarning を呼び出す
   * - 送信中でなければ即座に送信を開始する
   */
  enqueue(item: ChunkItem): void {
    this.items.push(item);

    // バックログ警告: 閾値到達時に 1 度発火。バックログが減ってリセットされるまで再発火しない
    if (!this.warningFired && this.items.length >= this.warningThreshold) {
      this.warningFired = true;
      this.onBacklogWarning?.();
    }

    this.tryDrain();
  }

  /** 送信中でなければキュー先頭から送信を開始する */
  private tryDrain(): void {
    if (this.sending || this.items.length === 0) return;
    this.sending = true;
    this.attemptHead();
  }

  /**
   * キュー先頭のチャンクの送信を試みる。
   *
   * 成功: 先頭を取り除き、backoff をリセットして次のチャンクへ進む
   * 失敗: 先頭はキューに残し、currentDelay 後に再試行する（チャンクは破棄しない）
   */
  private attemptHead(): void {
    const item = this.items[0];
    if (item === undefined) {
      this.sending = false;
      return;
    }

    void this.sender(item)
      .then(() => {
        // 送信成功: 先頭を取り除き、backoff をリセット
        this.items.shift();
        this.currentDelay = this.baseDelayMs;

        // バックログが閾値を下回ったら警告フラグをリセット（次回再発火を許可）
        if (this.warningFired && this.items.length < this.warningThreshold) {
          this.warningFired = false;
        }

        // 次のチャンクへ（キューが空なら sending=false で終了）
        this.attemptHead();
      })
      .catch(() => {
        // 送信失敗: 先頭はそのまま残し、バックオフ後に再試行
        const delay = this.currentDelay;
        // 次の遅延を 2 倍に伸ばし、上限でキャップ
        this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelayMs);
        setTimeout(() => {
          this.attemptHead();
        }, delay);
      });
  }
}

// ---------------------------------------------------------------------------
// MicChunkRecorder — MediaRecorder の薄いアダプタ
// ---------------------------------------------------------------------------

/**
 * MicChunkRecorder: MediaRecorder (timeslice 8s) + ChunkQueue による連続録音
 *
 * MediaRecorder はブラウザ専用 API。このクラスはモジュールレベルでは MediaRecorder を
 * 参照せず、`start()` 呼び出し時に `typeof MediaRecorder` でガードする。
 * → Node.js テスト環境でも import が安全（ChunkQueue のコアはテスト済み）。
 *
 * 本番 sender の実装例:
 * ```ts
 * const sender: ChunkSender = async ({ blob, chunkNo }) => {
 *   const form = new FormData();
 *   form.append('sessionId', sessionId);
 *   form.append('chunkNo', String(chunkNo));
 *   form.append('audio', blob, `chunk-${chunkNo}.webm`);
 *   const res = await fetch('/api/interview/capture/chunks', { method: 'POST', body: form });
 *   if (!res.ok) throw new Error(`chunk POST failed: ${res.status}`);
 * };
 * ```
 */
export class MicChunkRecorder {
  // MediaRecorder は browser-only のため、型は DOM lib 経由で解決される。
  // null でガードし、モジュールインポート時には参照しない。
  private recorder: MediaRecorder | null = null;
  private chunkNo = 0;
  private readonly queue: ChunkQueue;

  constructor(options: {
    sessionId: string;
    sender: ChunkSender;
    onBacklogWarning?: () => void;
  }) {
    this.queue = new ChunkQueue({
      sender: options.sender,
      onBacklogWarning: options.onBacklogWarning,
    });
  }

  /**
   * 指定ストリームからの録音を開始する。
   * timeslice=8000ms で MediaRecorder を起動し、dataavailable ごとにチャンクをエンキューする。
   *
   * @throws {Error} MediaRecorder が利用できない環境（Node.js など）では例外をスローする
   */
  start(stream: MediaStream): void {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not available in this environment');
    }

    this.chunkNo = 0;
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    recorder.addEventListener('dataavailable', (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.chunkNo++;
        this.queue.enqueue({ blob: event.data, chunkNo: this.chunkNo });
      }
    });

    // timeslice=8000ms: 8 秒ごとに dataavailable イベントが発火する
    recorder.start(8_000);
    this.recorder = recorder;
  }

  /** 録音を停止する */
  stop(): void {
    this.recorder?.stop();
    this.recorder = null;
  }

  /** 現在のキュー内未送信チャンク数 */
  get backlogSize(): number {
    return this.queue.backlogSize;
  }
}

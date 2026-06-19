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

/** MediaRecorder に渡す mimeType の優先順（lib/audio/recorder.ts と同じ選定方針） */
const MIME_TYPE_PRIORITY = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const;

/**
 * このブラウザがサポートする mimeType を優先順で選ぶ。
 * いずれも未サポートならブラウザ既定（空文字）を使う。
 */
function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}

/**
 * MicChunkRecorder: 8 秒ウィンドウごとの「録音→停止→（次ウィンドウを遅延起動）」+ ChunkQueue
 *
 * ## なぜ timeslice ではなく ウィンドウ録音 なのか
 * `MediaRecorder.start(timeslice)` の各 dataavailable Blob は **先頭のみ** WebM/EBML
 * ヘッダ（初期化セグメント）を含み、2 番目以降はヘッダ無しのクラスタ断片になる。
 * これらの断片を 1 個ずつ独立ファイルとしてバッチ転写（ffmpeg/Whisper）に渡すと、
 * 先頭チャンク以外は "Invalid data" でデコードできない。
 * そこで本実装は「1 ウィンドウ = 1 回の完結した録音（start→stop）」とし、各チャンクを
 * **自己完結した完全な webm** として生成する。stop で集めた断片を 1 つの Blob に結合する。
 * 8 秒境界で数十 ms 程度の取りこぼしが生じうるが、転写用途では許容する（MVP 判断）。
 *
 * ## 次ウィンドウの遅延起動（NotSupportedError 回避）
 * MediaRecorder の 'stop' イベントハンドラ内で同期的に新しい MediaRecorder を start() すると、
 * 一部ブラウザ（Chromium）が `NotSupportedError: Failed to execute 'start'` を投げる。
 * そのため次ウィンドウの起動は windowTimer 側で stop() を呼んだ後、`setTimeout(0)` で
 * stop イベント処理の外に逃がして起動する（'stop' ハンドラはチャンク結合・エンキューのみ）。
 *
 * ## chunkNo の連番維持
 * chunkNo はインスタンス生成時に 0 で初期化され、ウィンドウ間・start() で **リセットしない**。
 * 一時停止→再開でも単調増加で連続するため、サーバー側の `mic:{sessionId}:{chunkNo}`
 * 冪等キーが再開前後で衝突しない。
 *
 * ## エラー処理
 * ウィンドウ起動に失敗（MediaRecorder 生成 / start() が throw）した場合は onError を呼ぶ。
 * 'stop' ハンドラや遅延起動はイベント/タイマー文脈で動くため、ここで握りつぶさず
 * onError 経由で UI（micError）に伝える（未捕捉例外でクラッシュさせない）。
 *
 * ## import 安全性
 * MediaRecorder はブラウザ専用 API。モジュールレベルでは参照せず、`start()` 呼び出し時に
 * `typeof MediaRecorder` でガードする（Node.js テスト環境でも import が安全）。
 */
export class MicChunkRecorder {
  // MediaRecorder は browser-only のため、型は DOM lib 経由で解決される。
  // null でガードし、モジュールインポート時には参照しない。
  private recorder: MediaRecorder | null = null;
  private chunkNo = 0;
  /** stop() 後にウィンドウを再開しないためのフラグ */
  private stopped = false;
  /** 現在ウィンドウを閉じるためのタイマー */
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  /** 次ウィンドウの遅延起動タイマー */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  /** 録音対象ストリーム（ウィンドウ間で再利用） */
  private stream: MediaStream | null = null;
  private readonly queue: ChunkQueue;
  private readonly windowMs: number;
  private readonly onError: ((err: Error) => void) | undefined;

  constructor(options: {
    sessionId: string;
    sender: ChunkSender;
    onBacklogWarning?: () => void;
    /** ウィンドウ起動に失敗したときの通知（UI の micError へ） */
    onError?: (err: Error) => void;
    /** 1 チャンクの録音長（ms）。既定 8000。テストで短縮可能 */
    windowMs?: number;
  }) {
    this.queue = new ChunkQueue({
      sender: options.sender,
      onBacklogWarning: options.onBacklogWarning,
    });
    this.onError = options.onError;
    this.windowMs = options.windowMs ?? 8_000;
  }

  /**
   * 指定ストリームからの録音を開始する。
   * 8 秒ごとに 1 つの完結した webm チャンクを生成し ChunkQueue へエンキューする。
   *
   * @throws {Error} MediaRecorder が利用できない環境（Node.js など）では例外をスローする
   */
  start(stream: MediaStream): void {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not available in this environment');
    }
    this.stopped = false;
    this.stream = stream;
    this.beginWindow();
  }

  /**
   * 1 ウィンドウ分の録音を開始する。
   * timeslice なしで start() し、windowMs 後に rotateWindow() で閉じる。
   * 'stop' イベントは断片の結合・エンキューのみを行う（次ウィンドウ起動はしない）。
   */
  private beginWindow(): void {
    if (this.stopped || this.stream === null) return;

    let recorder: MediaRecorder;
    const mimeType = pickSupportedMimeType();
    try {
      recorder = new MediaRecorder(
        this.stream,
        mimeType ? { mimeType } : {},
      );
    } catch (err) {
      this.fail(err);
      return;
    }

    const parts: Blob[] = [];
    const blobType = mimeType || 'audio/webm';

    recorder.addEventListener('dataavailable', (event: BlobEvent) => {
      if (event.data.size > 0) {
        parts.push(event.data);
      }
    });

    recorder.addEventListener('stop', () => {
      // このウィンドウの断片を 1 つの完全なメディアファイルに結合してエンキュー
      if (parts.length > 0) {
        const blob = new Blob(parts, { type: blobType });
        if (blob.size > 0) {
          this.chunkNo++;
          this.queue.enqueue({ blob, chunkNo: this.chunkNo });
        }
      }
    });

    this.recorder = recorder;
    try {
      // timeslice なし: stop() 時に 1 つの完結した webm が得られる
      recorder.start();
    } catch (err) {
      this.fail(err);
      return;
    }

    this.windowTimer = setTimeout(() => this.rotateWindow(), this.windowMs);
  }

  /**
   * 現在ウィンドウを閉じ、次ウィンドウを遅延起動する。
   * 次ウィンドウの start() を 'stop' ハンドラの外（setTimeout 0）で行うことで、
   * Chromium の NotSupportedError（stop ハンドラ内 start）を回避する。
   */
  private rotateWindow(): void {
    const current = this.recorder;
    if (current && current.state !== 'inactive') {
      current.stop(); // 'stop' ハンドラが断片を結合・エンキューする
    }
    if (!this.stopped) {
      this.restartTimer = setTimeout(() => this.beginWindow(), 0);
    }
  }

  /**
   * 録音を停止する。
   * 進行中ウィンドウは stop() され、その末尾分も最終チャンクとしてエンキューされる。
   */
  stop(): void {
    this.stopped = true;
    if (this.windowTimer !== null) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;
  }

  /** ウィンドウ起動失敗時: 録音を止め、onError で UI に通知する */
  private fail(err: unknown): void {
    this.stopped = true;
    if (this.windowTimer !== null) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.recorder = null;
    this.onError?.(err instanceof Error ? err : new Error(String(err)));
  }

  /** 現在のキュー内未送信チャンク数 */
  get backlogSize(): number {
    return this.queue.backlogSize;
  }
}

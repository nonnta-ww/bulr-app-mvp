'use client';
/**
 * use-mic-capture.ts — 対面マイク録音のクライアント結線
 *
 * 対面(mic)モードのとき、ブラウザのマイクを取得して MicChunkRecorder で連続録音し、
 * 8 秒チャンクを /api/interview/capture/chunks へ POST する。これにより
 * transcript_segment が生成され、論理ターン化 → 質問候補生成 → ライブ表示に乗る。
 *
 * recall モードでは転写が webhook 経由で届くため、このフックは何もしない（active=false）。
 *
 * ## ライフサイクル
 * - active=true（capture_provider==='mic' かつ capture_status==='recording'）:
 *   getUserMedia → MicChunkRecorder.start(stream)
 * - active=false（idle / paused / stopping / 終了状態）/ unmount:
 *   MicChunkRecorder.stop() + MediaStream トラック解放（マイク使用を止める）
 *
 * ## 一時停止→再開と chunkNo
 * MicChunkRecorder インスタンスは ref に保持し、一時停止→再開（active false→true）でも
 * 同一インスタンスを再利用する。MicChunkRecorder.start() は chunkNo をリセットしないため、
 * 再開後のチャンクは連番が継続し、サーバーの `mic:{sessionId}:{chunkNo}` 冪等キーが
 * 再開前後で衝突しない。
 *
 * ## テスト容易性
 * getUserMedia / レコーダ生成 / sender 生成を deps で注入可能にし、jsdom（MediaRecorder 不在）
 * でもフックの分岐・ライフサイクルを検証できるようにする。本番では既定実装を使う。
 *
 * Requirements: 1.5, 8.3
 * Design: ChunkIngestion + MicChunkRecorder（クライアント結線）
 */

import { useEffect, useRef, useState } from 'react';

import { MicChunkRecorder, type ChunkItem, type ChunkSender } from './mic-chunk-recorder';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const CHUNKS_ENDPOINT = '/api/interview/capture/chunks';

/** マイク権限拒否・取得失敗時のユーザー向けメッセージ */
const MIC_PERMISSION_ERROR =
  'マイクにアクセスできませんでした。ブラウザのマイク権限を許可して、ページを再読み込みしてください。';

/** マイク API 非対応環境（古いブラウザ / 非セキュアコンテキスト等）のメッセージ */
const MIC_UNSUPPORTED_ERROR =
  'このブラウザでは録音を開始できません（マイク API が利用できません）。';

/** 録音開始に失敗したとき（MediaRecorder の起動失敗など）のメッセージ */
const MIC_RECORDING_ERROR =
  '録音を開始できませんでした。ページを再読み込みしても解決しない場合は別のブラウザをお試しください。';

// ---------------------------------------------------------------------------
// 本番 sender
// ---------------------------------------------------------------------------

/**
 * チャンクを /api/interview/capture/chunks へ multipart POST する本番 sender を生成する。
 *
 * !ok の場合は throw する。ChunkQueue が throw を捕捉し、同一 chunkNo で指数バックオフ再送する
 * （チャンクを破棄しない: Req 8.3）。
 */
export function createChunkSender(sessionId: string): ChunkSender {
  return async ({ blob, chunkNo }: ChunkItem) => {
    const form = new FormData();
    form.append('sessionId', sessionId);
    form.append('chunkNo', String(chunkNo));
    form.append('audio', blob, `chunk-${chunkNo}.webm`);

    const res = await fetch(CHUNKS_ENDPOINT, { method: 'POST', body: form });
    if (!res.ok) {
      throw new Error(`chunk POST failed: HTTP ${res.status}`);
    }
  };
}

// ---------------------------------------------------------------------------
// 型定義（注入用）
// ---------------------------------------------------------------------------

/** MicChunkRecorder のうちフックが利用する最小インターフェース（テストで差し替え可能） */
export interface RecorderLike {
  start(stream: MediaStream): void;
  stop(): void;
}

export interface MicCaptureDeps {
  /** マイクストリーム取得（既定: navigator.mediaDevices.getUserMedia({audio:true})） */
  getUserMedia?: (() => Promise<MediaStream>) | null;
  /** レコーダ生成（既定: new MicChunkRecorder） */
  createRecorder?: (opts: {
    sessionId: string;
    sender: ChunkSender;
    onBacklogWarning?: () => void;
    onError?: (err: Error) => void;
  }) => RecorderLike;
  /** sender 生成（既定: createChunkSender） */
  createSender?: (sessionId: string) => ChunkSender;
}

export interface UseMicCaptureOptions {
  sessionId: string;
  /** 録音すべきか（capture_provider==='mic' かつ capture_status==='recording'） */
  active: boolean;
  /** テスト/特殊用途向けの注入（本番では省略） */
  deps?: MicCaptureDeps;
}

export interface UseMicCaptureResult {
  /** マイク取得失敗・非対応時のメッセージ（正常時は null） */
  micError: string | null;
  /** 未送信チャンクが警告閾値(30 件)に達したか（ネットワーク不安定の指標） */
  backlogWarning: boolean;
}

// ---------------------------------------------------------------------------
// 既定実装
// ---------------------------------------------------------------------------

function defaultGetUserMedia(): (() => Promise<MediaStream>) | null {
  if (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  ) {
    return () => navigator.mediaDevices.getUserMedia({ audio: true });
  }
  return null;
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

// ---------------------------------------------------------------------------
// フック本体
// ---------------------------------------------------------------------------

/**
 * 対面マイク録音のライフサイクルを管理するフック。
 *
 * @param options.sessionId 面接セッション ID
 * @param options.active    録音すべきか（mic モード かつ recording のとき true）
 * @param options.deps      注入（テスト用）。本番では省略
 */
export function useMicCapture({
  sessionId,
  active,
  deps,
}: UseMicCaptureOptions): UseMicCaptureResult {
  const [micError, setMicError] = useState<string | null>(null);
  const [backlogWarning, setBacklogWarning] = useState(false);

  // deps はレンダーごとに新しい参照になりうるため ref に退避し、effect の依存に含めない
  // （[active, sessionId] のみで effect を再実行する）。
  const depsRef = useRef<MicCaptureDeps | undefined>(deps);
  depsRef.current = deps;

  // 一時停止→再開で同一インスタンスを再利用し chunkNo を連番維持するため ref に保持する。
  const recorderRef = useRef<RecorderLike | null>(null);

  useEffect(() => {
    if (!active) return;

    const d = depsRef.current;
    const getUserMedia =
      d && 'getUserMedia' in d ? d.getUserMedia : defaultGetUserMedia();

    if (!getUserMedia) {
      setMicError(MIC_UNSUPPORTED_ERROR);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    void (async () => {
      try {
        stream = await getUserMedia();
        // 取得中に active=false / unmount された場合はトラックを解放して終了
        if (cancelled) {
          stopStream(stream);
          stream = null;
          return;
        }

        if (!recorderRef.current) {
          const createSender = d?.createSender ?? createChunkSender;
          const createRecorder =
            d?.createRecorder ?? ((opts) => new MicChunkRecorder(opts));
          recorderRef.current = createRecorder({
            sessionId,
            sender: createSender(sessionId),
            onBacklogWarning: () => setBacklogWarning(true),
            onError: () => setMicError(MIC_RECORDING_ERROR),
          });
        }

        recorderRef.current.start(stream);
        setMicError(null);
      } catch {
        if (!cancelled) {
          setMicError(MIC_PERMISSION_ERROR);
        }
      }
    })();

    return () => {
      cancelled = true;
      recorderRef.current?.stop();
      stopStream(stream);
      stream = null;
    };
  }, [active, sessionId]);

  return { micError, backlogWarning };
}

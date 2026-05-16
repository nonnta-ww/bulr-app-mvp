'use client';

/**
 * RecordingState Client Component
 *
 * 音声録音中の状態を表示し、録音の開始・停止・送信を管理するコンポーネント。
 * createAudioRecorder を使用してマイク録音を行い、onSubmit で音声データを送信する。
 *
 * Requirements: 5.2, 5.3, 5.5, 5.6, 5.8, 5.9, 5.10, 5.11, 5.12, 10.11
 */

import { useEffect, useRef, useState, useCallback } from 'react';

import { createAudioRecorder } from '@/lib/audio/recorder';
import type { AudioRecorder } from '@/lib/audio/recorder';
import { AudioVisualizer } from './audio-visualizer';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const MAX_BLOB_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const AUTO_STOP_SEC = 600; // 10分

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecordingStateProps {
  currentQuestion: string;
  patternTitle: string;
  progress: {
    patternsDone: number;
    patternsTotal: number;
    elapsedSec: number;
    totalSec: number; // 2400 (40 min)
  };
  onSubmit: (audio: Blob, durationMs: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function formatTime(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// RecordingState Component
// ---------------------------------------------------------------------------

export function RecordingState({
  currentQuestion,
  patternTitle,
  progress,
  onSubmit,
}: RecordingStateProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  // H5 (Req 10.11): マイク権限拒否などの録音開始失敗時にエラーメッセージを表示
  const [micError, setMicError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false); // 二重送信防止用

  // ---------------------------------------------------------------------------
  // 録音停止 → onSubmit 呼び出し
  // ---------------------------------------------------------------------------

  const handleStop = useCallback(async () => {
    if (submittingRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    submittingRef.current = true;
    setIsSubmitting(true);

    // タイマー停止
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const startTime = startTimeRef.current ?? Date.now();

    try {
      const blob = await recorder.stop();
      const durationMs = Date.now() - startTime;

      // Blob サイズチェック
      if (blob.size > MAX_BLOB_SIZE_BYTES) {
        setSizeError(true);
        submittingRef.current = false;
        setIsSubmitting(false);
        // 録音をリセット: 新しいレコーダーを作成して再開
        const newRecorder = createAudioRecorder();
        newRecorder.onAutoStop = () => void handleStop();
        recorderRef.current = newRecorder;
        startTimeRef.current = Date.now();
        setElapsedSec(0);
        await newRecorder.start();
        // タイマー再開
        intervalRef.current = setInterval(() => {
          setElapsedSec((prev) => prev + 1);
        }, 1000);
        return;
      }

      setSizeError(false);
      await onSubmit(blob, durationMs);
    } catch {
      // エラー時はリセット
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [onSubmit]);

  // ---------------------------------------------------------------------------
  // マウント時に録音開始
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    const recorder = createAudioRecorder();
    recorder.onAutoStop = () => void handleStop();
    recorderRef.current = recorder;

    void (async () => {
      try {
        await recorder.start();
        if (!mounted) {
          // アンマウント済みの場合は即停止
          if (recorder.state === 'recording') {
            await recorder.stop();
          }
          return;
        }

        startTimeRef.current = Date.now();
        setMediaStream(recorder.stream);

        // 経過時間タイマー
        intervalRef.current = setInterval(() => {
          setElapsedSec((prev) => {
            const next = prev + 1;
            // 10分に達したら自動停止
            if (next >= AUTO_STOP_SEC && !submittingRef.current) {
              void handleStop();
            }
            return next;
          });
        }, 1000);
      } catch (err) {
        // H5 (Req 10.11): マイクアクセス失敗を UI に表示
        if (!mounted) return;
        const isPermissionDenied =
          err instanceof Error &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        setMicError(
          isPermissionDenied
            ? 'マイクへのアクセスを許可してください'
            : 'マイクを利用できません。デバイスや権限を確認してください',
        );
      }
    })();

    return () => {
      mounted = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const r = recorderRef.current;
      if (r && r.state === 'recording') {
        void r.stop();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const { patternsDone, patternsTotal } = progress;

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-white p-8 shadow-md">
      {/* 録音インジケーター */}
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
        </span>
        <span className="text-sm font-semibold text-red-600">録音中</span>
        <span className="ml-auto font-mono text-sm text-gray-500">{formatTime(elapsedSec)}</span>
      </div>

      {/* サイズエラー */}
      {sizeError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          録音サイズが上限超過、再録音してください
        </div>
      )}

      {/* H5 (Req 10.11): マイクアクセスエラー */}
      {micError !== null && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {micError}
        </div>
      )}

      {/* プログレス */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>
          {patternsDone}/{patternsTotal} パターン
        </span>
        <span className="ml-auto font-mono">{Math.floor(progress.elapsedSec / 60)}分/{Math.floor(progress.totalSec / 60)}分</span>
      </div>

      {/* パターンタイトル */}
      <p className="text-base font-medium text-gray-500">{patternTitle}</p>

      {/* 現在の質問 */}
      <p className="text-xl font-bold leading-relaxed text-gray-900">{currentQuestion}</p>

      {/* 次の質問へボタン */}
      <button
        type="button"
        onClick={() => void handleStop()}
        disabled={isSubmitting}
        className="mt-2 w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '送信中...' : '次の質問へ'}
      </button>

      {/* 音声レベルビジュアライザー */}
      <AudioVisualizer stream={mediaStream} />
    </div>
  );
}

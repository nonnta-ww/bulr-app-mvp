'use client';

/**
 * MockInterviewChat — 模擬面接チャット UI（Client Component）
 *
 * - セッション開始時（履歴が空）に /api/mock-interview/turns/next を呼び最初の質問を取得
 * - テキスト入力欄（Enter 送信、Shift+Enter 改行）と「送信」ボタン
 * - 「面接を終了する」ボタン押下で /api/mock-interview/finalize を呼び、
 *   完了後 /mock-interview/[sessionId]/result へナビゲート
 * - isLoading=true 中は入力欄・送信ボタンを disabled にしてローディングインジケータ表示
 * - 会話ビューはインタビュアー（左）と候補者（右）のバブル形式
 *
 * Requirements: 要件3, 要件4, 要件10
 * Boundary: UI コンポーネント
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import type { TurnItem } from '@bulr/ai-mock';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface TurnsNextResponse {
  question: string;
  currentLevel: number;
  usage: { input_tokens: number; output_tokens: number };
}

interface FinalizeResponse {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MockInterviewChatProps {
  sessionId: string;
  patternCode: string;
  /** ヘッダに表示するパターン名 */
  patternTitle?: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function MockInterviewChat({
  sessionId,
  patternCode,
  patternTitle = '模擬面接',
}: MockInterviewChatProps) {
  const router = useRouter();

  const [history, setHistory] = useState<TurnItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [accumulatedUsage, setAccumulatedUsage] = useState<{
    input_tokens: number;
    output_tokens: number;
  }>({ input_tokens: 0, output_tokens: 0 });

  // React Strict Mode での二重呼び出し防止フラグ
  const initialFetchCalledRef = useRef(false);

  // チャット末尾へのスクロール用
  const bottomRef = useRef<HTMLDivElement>(null);

  // 経過時間（秒）— マウントから 1 秒ごとに加算
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedLabel = `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(
    elapsedSec % 60,
  ).padStart(2, '0')}`;

  // ターン数 = 面接官の質問数
  const turnCount = history.filter((t) => t.role === 'interviewer').length;

  // ---------------------------------------------------------------------------
  // ヘルパー: turns/next API 呼び出し
  // ---------------------------------------------------------------------------

  const fetchNextQuestion = useCallback(
    async (
      currentHistory: TurnItem[],
      userMessage?: string,
    ): Promise<TurnsNextResponse | null> => {
      const res = await fetch('/api/mock-interview/turns/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userMessage,
          history: currentHistory,
          patternCode,
        }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const errBody = (await res.json()) as { error?: string };
          detail = errBody.error ?? '';
        } catch {
          // ignore
        }
        throw new Error(
          detail
            ? `次の質問の取得に失敗しました（${detail}）。`
            : '次の質問の取得に失敗しました。もう一度お試しください。',
        );
      }

      return (await res.json()) as TurnsNextResponse;
    },
    [sessionId, patternCode],
  );

  // ---------------------------------------------------------------------------
  // マウント時: 履歴が空なら最初の質問を取得
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // React Strict Mode の二重呼び出しを防ぐ（ref ガードで 1 回だけ fetch を発行）
    if (initialFetchCalledRef.current) return;
    initialFetchCalledRef.current = true;

    async function fetchInitialQuestion() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const data = await fetchNextQuestion([]);
        if (!data) return;
        const interviewerTurn: TurnItem = { role: 'interviewer', content: data.question };
        setHistory([interviewerTurn]);
        setAccumulatedUsage((prev) => ({
          input_tokens: prev.input_tokens + data.usage.input_tokens,
          output_tokens: prev.output_tokens + data.usage.output_tokens,
        }));
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : '初期質問の取得に失敗しました。',
        );
      } finally {
        setIsLoading(false);
      }
    }

    void fetchInitialQuestion();
  }, [fetchNextQuestion]);

  // ---------------------------------------------------------------------------
  // 新しいメッセージが追加されたら末尾へスクロール
  // ---------------------------------------------------------------------------

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // ---------------------------------------------------------------------------
  // メッセージ送信ハンドラ
  // ---------------------------------------------------------------------------

  async function handleSend() {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading || isFinalizing) return;

    setInputValue('');
    setErrorMessage('');
    setIsLoading(true);

    // 候補者のターンを先に追加
    const candidateTurn: TurnItem = { role: 'candidate', content: trimmed };
    const historyWithCandidate = [...history, candidateTurn];
    setHistory(historyWithCandidate);

    try {
      const data = await fetchNextQuestion(historyWithCandidate, trimmed);
      if (!data) return;
      const interviewerTurn: TurnItem = { role: 'interviewer', content: data.question };
      setHistory((prev) => [...prev, interviewerTurn]);
      setAccumulatedUsage((prev) => ({
        input_tokens: prev.input_tokens + data.usage.input_tokens,
        output_tokens: prev.output_tokens + data.usage.output_tokens,
      }));
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : '送信に失敗しました。もう一度お試しください。',
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // テキストエリア KeyDown: Enter 送信 / Shift+Enter 改行
  // ---------------------------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // IME 変換確定の Enter を送信扱いしない
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ---------------------------------------------------------------------------
  // 面接終了ハンドラ
  // ---------------------------------------------------------------------------

  async function handleFinalize() {
    if (isLoading || isFinalizing) return;

    setIsFinalizing(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/mock-interview/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          history,
          patternCode,
          accumulatedUsage,
        }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const errBody = (await res.json()) as { error?: string };
          detail = errBody.error ?? '';
        } catch {
          // ignore
        }
        throw new Error(
          detail
            ? `面接の終了に失敗しました（${detail}）。`
            : '面接の終了に失敗しました。もう一度お試しください。',
        );
      }

      const data = (await res.json()) as FinalizeResponse;
      router.push(`/mock-interview/${data.sessionId}/result`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : '面接の終了に失敗しました。',
      );
      setIsFinalizing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  const isDisabled = isLoading || isFinalizing;

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-card px-4 py-3">
        <h1 className="min-w-0 truncate text-base font-bold text-ink">{patternTitle}</h1>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              schedule
            </span>
            <span className="tabular-nums">経過時間 {elapsedLabel}</span>
            <span className="text-hairline">·</span>
            <span>ターン {turnCount}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={isDisabled}
            className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-medium text-slate transition-colors hover:border-slate hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFinalizing ? '終了処理中...' : '終了する'}
          </button>
        </div>
      </div>

      {/* チャット履歴エリア */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {/* 初期ローディング（履歴が空かつ isLoading） */}
          {history.length === 0 && isLoading && (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-muted">面接官が準備中です...</span>
            </div>
          )}

          {/* 会話バブル */}
          {history.map((turn, index) => (
            <div
              key={index}
              className={`flex ${turn.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
            >
              {/* インタビュアーラベル（左側） */}
              {turn.role === 'interviewer' && (
                <div className="mr-2 flex-shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-slate">
                    AI
                  </div>
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  turn.role === 'interviewer'
                    ? 'rounded-tl-sm bg-card text-ink shadow-ambient'
                    : 'rounded-tr-sm bg-primary/20 text-ink'
                }`}
              >
                {turn.content}
              </div>

              {/* 候補者ラベル（右側） */}
              {turn.role === 'candidate' && (
                <div className="ml-2 flex-shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                    You
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 面接官が回答待ち中のローディングインジケータ */}
          {isLoading && history.length > 0 && (
            <div className="flex justify-start">
              <div className="mr-2 flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-slate">
                  AI
                </div>
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-card px-4 py-2.5 shadow-ambient">
                <span className="inline-flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate" />
                </span>
              </div>
            </div>
          )}

          {/* スクロール末尾アンカー */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* エラーメッセージ */}
      {errorMessage && (
        <div className="border-t border-[#f5c6c2] bg-[#ffdad6] px-4 py-2">
          <p role="alert" className="text-sm text-[#93000a]">
            {errorMessage}
          </p>
        </div>
      )}

      {/* 入力エリア */}
      <div className="border-t border-hairline bg-card px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            rows={3}
            placeholder="ここに回答を入力してください。"
            className="block flex-1 resize-none rounded-lg border border-hairline bg-card px-3 py-2 text-sm text-ink placeholder:text-muted transition-all focus:border-slate focus:outline-none focus:shadow-[0_0_0_2px_rgba(242,187,167,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isDisabled || !inputValue.trim()}
            aria-label="送信"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              {isLoading ? 'hourglass_empty' : 'arrow_forward'}
            </span>
          </button>
        </div>
        <p className="mt-1.5 text-right text-xs text-muted">
          Enter キーで送信、Shift + Enter で改行
        </p>
      </div>
    </div>
  );
}

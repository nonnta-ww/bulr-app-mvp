'use client';

/**
 * InterviewSessionRunner Client Component
 *
 * ライブ面接セッションのメインオーケストレーターコンポーネント。
 * recording → loading → choosing のモード遷移を管理し、
 * 録音送信・質問選択・面接終了の一連のフローを制御する。
 *
 * Requirements: 5.1, 6.1, 6.9, 7.12, 7.13, 7.14, 7.15
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

import type { InterviewSession } from '@bulr/db/schema';
import type { InterviewTurn } from '@bulr/db/schema';
import type { QuestionProposal } from '@bulr/db/schema';
import type { Candidate } from '@bulr/db/schema';

import { selectProposalChoice } from '@/lib/actions/select-proposal-choice';
import { RecordingState } from './recording-state';
import { ProposalChoiceState } from './proposal-choice-state';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface InterviewSessionRunnerProps {
  session: InterviewSession;
  turns: InterviewTurn[];
  latestProposal: QuestionProposal | null;
  candidate: Candidate;
}

type Mode = 'recording' | 'choosing' | 'loading' | 'finalizing';

// API レスポンス型 (turns/next)
interface TurnsNextResponse {
  turn: InterviewTurn;
  proposal: QuestionProposal | null;
  coverage: unknown;
}

// ---------------------------------------------------------------------------
// InterviewSessionRunner Component
// ---------------------------------------------------------------------------

export function InterviewSessionRunner({
  session,
  turns,
  latestProposal,
  candidate: _candidate,
}: InterviewSessionRunnerProps) {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [mode, setMode] = useState<Mode>('recording');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentProposal, setCurrentProposal] = useState<QuestionProposal | null>(latestProposal);
  const [currentTurnId, setCurrentTurnId] = useState<string>(() => nanoid(21));
  const [regenerating, setRegenerating] = useState(false);
  const [lastInsertedTurnId, setLastInsertedTurnId] = useState<string | null>(null);

  // 最新ターンのトランスクリプトと分析メモ（初期値は props から設定）
  const [lastTurnTranscript, setLastTurnTranscript] = useState<{ candidate: string }>(() => {
    const last = turns.length > 0 ? turns[turns.length - 1] : undefined;
    return { candidate: last?.transcript.candidate ?? '' };
  });
  const [lastTurnAnalysisNotes, setLastTurnAnalysisNotes] = useState<string>(() => {
    const last = turns.length > 0 ? turns[turns.length - 1] : undefined;
    return last?.llm_analysis?.notes ?? '';
  });

  // トースト通知
  const [toast, setToast] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Toast ユーティリティ
  // ---------------------------------------------------------------------------

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ---------------------------------------------------------------------------
  // State A: recording → onSubmit ハンドラ
  // ---------------------------------------------------------------------------

  const handleRecordingSubmit = useCallback(
    async (audio: Blob, durationMs: number) => {
      setMode('loading');

      const formData = new FormData();
      formData.append('audio', audio);
      formData.append('turnId', currentTurnId);
      formData.append('sessionId', session.id);
      formData.append('questionSource', currentQuestion ? 'proposal' : 'manual');
      formData.append('questionText', currentQuestion);
      formData.append('durationMs', String(durationMs));

      try {
        const res = await fetch('/api/interview/turns/next', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = (await res.json()) as TurnsNextResponse;
          setLastInsertedTurnId(data.turn.id);
          // 最新ターンのデータを更新
          setLastTurnTranscript({ candidate: data.turn.transcript?.candidate ?? '' });
          setLastTurnAnalysisNotes(data.turn.llm_analysis?.notes ?? '');
          setCurrentProposal(data.proposal);
          setMode('choosing');
          return;
        }

        // エラーレスポンスの処理
        if (res.status === 503) {
          let body: { code?: string } = {};
          try {
            body = (await res.json()) as { code?: string };
          } catch {
            // JSON パース失敗は無視
          }
          if (body.code === 'core_phase_failed') {
            showToast('処理に失敗しました。同じ録音で再試行できます');
            setMode('recording');
            // 同じ turnId を保持（冪等性のため）
            return;
          }
        }

        if (res.status === 429) {
          showToast('レート制限超過');
          setMode('choosing');
          return;
        }

        // その他のエラー
        showToast('エラーが発生しました');
        setMode('recording');
      } catch {
        showToast('エラーが発生しました');
        setMode('recording');
      }
    },
    [currentQuestion, currentTurnId, session.id, showToast],
  );

  // ---------------------------------------------------------------------------
  // State B: choosing → onChoice ハンドラ
  // ---------------------------------------------------------------------------

  const handleChoice = useCallback(
    async (selectedIndex: 1 | 2 | 3 | null, questionText: string) => {
      if (currentProposal?.id) {
        await selectProposalChoice({
          proposalId: currentProposal.id,
          selectedIndex,
        });
      }
      setCurrentTurnId(nanoid(21));
      setCurrentQuestion(questionText);
      setMode('recording');
    },
    [currentProposal],
  );

  // ---------------------------------------------------------------------------
  // State B: choosing → onRegenerate ハンドラ
  // ---------------------------------------------------------------------------

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/interview/proposal/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, afterTurnId: lastInsertedTurnId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { proposal: QuestionProposal };
        setCurrentProposal(data.proposal);
      } else {
        showToast('再試行してください');
      }
    } catch {
      showToast('再試行してください');
    } finally {
      setRegenerating(false);
    }
  }, [session.id, lastInsertedTurnId, showToast]);

  // ---------------------------------------------------------------------------
  // State B: choosing → onFinalize ハンドラ
  // ---------------------------------------------------------------------------

  const handleFinalize = useCallback(async () => {
    setMode('finalizing');
    try {
      const res = await fetch('/api/interview/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (res.ok) {
        router.push('/interviews/' + session.id + '/report');
      } else {
        showToast('エラーが発生しました');
        setMode('choosing');
      }
    } catch {
      showToast('エラーが発生しました');
      setMode('choosing');
    }
  }, [session.id, router, showToast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const progress = {
    patternsDone: 0,
    patternsTotal: session.planned_pattern_codes.length,
    elapsedSec: 0,
    totalSec: 2400,
  };

  return (
    <div className="relative">
      {/* トースト通知 */}
      {toast !== null && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-800 px-5 py-3 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* モード別レンダリング */}
      {mode === 'recording' && (
        <RecordingState
          currentQuestion={currentQuestion}
          patternTitle=""
          progress={progress}
          onSubmit={handleRecordingSubmit}
        />
      )}

      {mode === 'choosing' && (
        <ProposalChoiceState
          lastTurnTranscript={lastTurnTranscript}
          lastTurnAnalysisNotes={lastTurnAnalysisNotes}
          proposal={currentProposal}
          regenerating={regenerating}
          onChoice={handleChoice}
          onRegenerate={handleRegenerate}
          onFinalize={handleFinalize}
        />
      )}

      {(mode === 'loading' || mode === 'finalizing') && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white p-12 shadow-md">
          <svg
            className="h-8 w-8 animate-spin text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-gray-600">処理中...</p>
        </div>
      )}
    </div>
  );
}

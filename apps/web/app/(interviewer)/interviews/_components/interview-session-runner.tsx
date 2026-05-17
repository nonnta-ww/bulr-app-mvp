'use client';

/**
 * InterviewSessionRunner Client Component
 *
 * ライブ面接セッションのメインオーケストレーターコンポーネント。
 * recording → loading → choosing のモード遷移を管理し、
 * 録音送信・質問選択・面接終了の一連のフローを制御する。
 *
 * Requirements: 5.1, 5.3, 5.6, 6.1, 6.9, 7.12, 7.13, 7.14, 7.15
 */

import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import { buildInitialAgenda } from './agenda/build-initial-agenda';
import { sessionRunnerReducer } from './agenda/session-runner-reducer';
import type { SessionState } from './agenda/session-runner-reducer';
import type { AnalysisTask, NextQuestionDraft } from './agenda/types';
import { useAnalysisTasks } from './agenda/use-analysis-tasks';
import { NextQuestionPicker } from './agenda/next-question-picker';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

import { parseSseStream, StreamEndedWithoutTerminalEvent } from '@/lib/interview/parse-sse-stream';
import { TurnsNextEvent } from '@/lib/interview/turns-next-events';
import type { ProgressStep } from '@/lib/interview/turns-next-events';
import { InterviewProgressSteps } from './interview-progress-steps';

import type { InterviewSession } from '@bulr/db/schema';
import type { InterviewTurn } from '@bulr/db/schema';
import type { QuestionProposal } from '@bulr/db/schema';
import type { Candidate } from '@bulr/db/schema';
import type { AssessmentPattern } from '@bulr/db/schema';

import { selectProposalChoice } from '@/lib/actions/select-proposal-choice';
import { RecordingState } from './recording-state';
import { ProposalChoiceState as _ProposalChoiceState } from './proposal-choice-state';
import { SessionAgendaSidebar } from './agenda/session-agenda-sidebar';
import { BackgroundAnalysisStrip } from './agenda/background-analysis-strip';
import { AnalysisResultDrawer } from './agenda/analysis-result-drawer';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface InterviewSessionRunnerProps {
  session: InterviewSession;
  turns: InterviewTurn[];
  latestProposal: QuestionProposal | null;
  candidate: Candidate;
  plannedPatterns: AssessmentPattern[];
}

type Mode = 'recording' | 'choosing' | 'loading' | 'finalizing';

// API が受け付ける questionSource enum
type QuestionSource = 'llm_candidate_1' | 'llm_candidate_2' | 'llm_candidate_3' | 'manual';

// ---------------------------------------------------------------------------
// InterviewSessionRunner Component
// ---------------------------------------------------------------------------

export function InterviewSessionRunner({
  session,
  turns,
  latestProposal,
  candidate: _candidate,
  plannedPatterns,
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
  // M6: 初期値を turns 末尾の id にすることでリロード後の [再試行] による
  // /api/interview/proposal/regenerate への afterTurnId 欠落（400）を防ぐ
  const [lastInsertedTurnId, setLastInsertedTurnId] = useState<string | null>(
    () => turns[turns.length - 1]?.id ?? null,
  );

  // C1: 現在の質問の出所（LLM 提案の何番目か / manual）。recording→submit で API へ送信
  const [currentQuestionSource, setCurrentQuestionSource] = useState<QuestionSource>('manual');
  // C2: proposal / pattern の現在値（FormData に append する）
  const [currentProposalId, setCurrentProposalId] = useState<string | null>(null);

  // patternId 追跡用 index。turns に既存の最終 pattern_id があればそれを起点にする
  const [currentPatternIndex, setCurrentPatternIndex] = useState<number>(() => {
    if (plannedPatterns.length === 0) return 0;
    for (let i = turns.length - 1; i >= 0; i--) {
      const pid = turns[i]?.pattern_id;
      if (pid != null) {
        const idx = plannedPatterns.findIndex((p) => p.id === pid);
        if (idx !== -1) return idx;
      }
    }
    return 0;
  });

  const currentPatternId: string | null = useMemo(() => {
    const p = plannedPatterns[currentPatternIndex];
    return p ? p.id : null;
  }, [plannedPatterns, currentPatternIndex]);

  const currentPatternTitle: string = useMemo(() => {
    const p = plannedPatterns[currentPatternIndex];
    // M1: pattern が解決できない場合は「フリー質問」
    return p ? p.title : 'フリー質問';
  }, [plannedPatterns, currentPatternIndex]);

  // ---- 新状態モデル（Task 11: 並走、まだUI未使用） ----
  // mount 時の初期値のみ使用。props 変化に追従しない（reducer が以後の状態を管理）
  const initialAgenda = useMemo(
    () => buildInitialAgenda(plannedPatterns, turns),
    [plannedPatterns, turns],
  );

  const initialDraft = useMemo<NextQuestionDraft>(() => {
    const firstFuture = initialAgenda.find((a) => a.status === 'future');
    if (firstFuture) {
      return {
        questionText: firstFuture.questionText,
        source: firstFuture.source,
        patternId: firstFuture.patternId,
        fromAnalysisTaskId: null,
      };
    }
    return {
      questionText: '',
      source: { kind: 'manual', parentTurnId: null },
      patternId: null,
      fromAnalysisTaskId: null,
    };
  }, [initialAgenda]);

  const [sessionState, dispatch] = useReducer(sessionRunnerReducer, {
    agenda: initialAgenda,
    phase: 'picking',
    currentItemId: null,
    nextDraft: initialDraft,
    openDrawerTaskId: null,
    taskStatuses: {},
  } satisfies SessionState);

  const { tasks: analysisTasks, spawn: spawnAnalysisTask, abortAll: abortAllAnalysisTasks } = useAnalysisTasks({
    onProgress: (turnId, step) => dispatch({ type: 'TASK_PROGRESS', turnId, step }),
    onCompleted: (turnId, candidates) => {
      dispatch({ type: 'TASK_COMPLETED', turnId, candidates });
    },
    onErrored: (turnId, error) => {
      dispatch({ type: 'TASK_ERRORED', turnId });
      // Toast 表示は後続タスクで結合
      void error;
    },
  });

  // spawnAnalysisTask / abortAllAnalysisTasks are wired in Task 14
  void spawnAnalysisTask; void abortAllAnalysisTasks;

  // 最新ターンのトランスクリプトと分析メモ（初期値は props から設定）
  const [lastTurnTranscript, setLastTurnTranscript] = useState<{ candidate: string }>(() => {
    const last = turns.length > 0 ? turns[turns.length - 1] : undefined;
    return { candidate: last?.transcript.candidate ?? '' };
  });
  const [lastTurnAnalysisNotes, setLastTurnAnalysisNotes] = useState<string>(() => {
    const last = turns.length > 0 ? turns[turns.length - 1] : undefined;
    return last?.llm_analysis?.notes ?? '';
  });

  // M2: ローカル turns 状態（completed coverage 数の計算に使用）
  const [localTurns, setLocalTurns] = useState<InterviewTurn[]>(turns);

  // M2: 経過秒数（session.started_at からの差分を 1 秒ごとに更新）
  const startedAtMs = useMemo<number | null>(() => {
    if (!session.started_at) return null;
    const t = new Date(session.started_at).getTime();
    return Number.isFinite(t) ? t : null;
  }, [session.started_at]);

  const [elapsedSec, setElapsedSec] = useState<number>(() => {
    if (startedAtMs == null) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  });

  useEffect(() => {
    if (startedAtMs == null) return;
    const timer = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAtMs]);

  // SSE 進捗ステップ
  const [progressStep, setProgressStep] = useState<ProgressStep>('upload');

  // AbortController — unmount 時の fetch クリーンアップ用
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // AbortController クリーンアップ（unmount 時に in-flight fetch を解放）
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // State A: recording → onSubmit ハンドラ
  // ---------------------------------------------------------------------------

  const handleRecordingSubmit = useCallback(
    async (audio: Blob, durationMs: number) => {
      setMode('loading');
      setProgressStep('upload'); // 進捗ステップをリセット

      const formData = new FormData();
      formData.append('audio', audio);
      formData.append('turnId', currentTurnId);
      formData.append('sessionId', session.id);
      // C1: API enum に一致する値を送信
      formData.append('questionSource', currentQuestionSource);
      // questionText は manual の場合は空文字、proposal 選択時は選択した候補テキスト
      formData.append('questionText', currentQuestion);
      // C2: proposalId / patternId を append（存在する場合のみ）
      if (currentQuestionSource !== 'manual' && currentProposalId) {
        formData.append('proposalId', currentProposalId);
      }
      if (currentPatternId) {
        formData.append('patternId', currentPatternId);
      }
      formData.append('durationMs', String(durationMs));

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch('/api/interview/turns/next', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        // ストリーム開始前の HTTP エラーハンドラ（4xx）
        if (!res.ok) {
          if (res.status === 429) {
            showToast('レート制限超過');
            setMode('recording');
            return;
          }
          // その他の HTTP エラー
          showToast('エラーが発生しました');
          setMode('recording');
          return;
        }

        if (!res.body) {
          showToast('エラーが発生しました');
          setMode('recording');
          return;
        }

        // SSE ストリームを逐次消費
        const reader = res.body.getReader();

        for await (const event of parseSseStream(
          reader,
          TurnsNextEvent,
          (e) => e.type !== 'progress',
        )) {
          if (event.type === 'progress') {
            setProgressStep(event.step);
          } else if (event.type === 'complete') {
            setLastInsertedTurnId(event.turn.id);
            // 最新ターンのデータを更新
            setLastTurnTranscript({ candidate: event.turn.transcript?.candidate ?? '' });
            setLastTurnAnalysisNotes(event.turn.llm_analysis?.notes ?? '');
            setCurrentProposal(event.proposal);
            // M2: ローカル turns に追記（completed coverage 計算用）
            setLocalTurns((prev) => [...prev, event.turn]);
            setMode('choosing');
          } else if (event.type === 'error') {
            showToast('処理に失敗しました。同じ録音で再試行できます');
            setMode('recording');
            // 同じ turnId を保持（冪等性のため）
            return;
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // unmount クリーンアップによる中断 — state 更新しない
          return;
        }
        if (e instanceof StreamEndedWithoutTerminalEvent) {
          showToast('処理に失敗しました。同じ録音で再試行できます');
          setMode('recording');
          return;
        }
        showToast('エラーが発生しました');
        setMode('recording');
      }
    },
    [
      currentQuestion,
      currentQuestionSource,
      currentProposalId,
      currentPatternId,
      currentTurnId,
      session.id,
      showToast,
    ],
  );

  // ---------------------------------------------------------------------------
  // State B': NextQuestionPicker → handleStartRecording
  // ---------------------------------------------------------------------------

  const handleStartRecording = useCallback(() => {
    const itemId = nanoid(21);
    dispatch({ type: 'START_RECORDING', itemId, startedAt: Date.now() });
    setCurrentTurnId(itemId);
    setCurrentQuestion(sessionState.nextDraft.questionText);

    // 候補配列のインデックスから 'llm_candidate_1/2/3' を決定。マッチしなければ 'manual'
    const fromTaskId = sessionState.nextDraft.fromAnalysisTaskId;
    const fromTask = fromTaskId ? analysisTasks.get(fromTaskId) : null;
    const candidateIdx = fromTask?.candidates
      ? fromTask.candidates.findIndex((c) => c.text === sessionState.nextDraft.questionText)
      : -1;
    const nextSource: QuestionSource =
      candidateIdx === 0 ? 'llm_candidate_1'
      : candidateIdx === 1 ? 'llm_candidate_2'
      : candidateIdx === 2 ? 'llm_candidate_3'
      : 'manual';
    setCurrentQuestionSource(nextSource);
    setCurrentProposalId(fromTask?.proposalId ?? null);

    // patternId 追跡（FormData の patternId 送信用に既存 index 整合）
    if (sessionState.nextDraft.patternId) {
      const idx = plannedPatterns.findIndex((p) => p.id === sessionState.nextDraft.patternId);
      if (idx >= 0) setCurrentPatternIndex(idx);
    }

    setMode('recording');
  }, [sessionState.nextDraft, analysisTasks, plannedPatterns]);

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

      // C1/C2/M1: 次のターンの questionSource / proposalId / patternIndex を確定
      if (selectedIndex === null) {
        // manual: pattern index は維持、proposalId は送信しない
        setCurrentQuestionSource('manual');
        setCurrentProposalId(null);
      } else {
        setCurrentQuestionSource(
          selectedIndex === 1
            ? 'llm_candidate_1'
            : selectedIndex === 2
              ? 'llm_candidate_2'
              : 'llm_candidate_3',
        );
        setCurrentProposalId(currentProposal?.id ?? null);

        // intent === 'next_pattern' なら index を進める
        const intent =
          selectedIndex === 1
            ? currentProposal?.candidate_1_intent
            : selectedIndex === 2
              ? currentProposal?.candidate_2_intent
              : currentProposal?.candidate_3_intent;
        if (intent === 'next_pattern' && plannedPatterns.length > 0) {
          setCurrentPatternIndex((prev) => (prev + 1) % plannedPatterns.length);
        }
      }

      setCurrentTurnId(nanoid(21));
      setCurrentQuestion(questionText);
      setMode('recording');
    },
    [currentProposal, plannedPatterns.length],
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

  // handleChoice / handleRegenerate / legacy state vars are removed in Task 15
  void handleChoice; void handleRegenerate; void regenerating; void currentProposal; void setCurrentProposal;
  void lastTurnTranscript; void lastTurnAnalysisNotes;

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
  void handleFinalize;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // M2: 完了したパターン coverage 数（pattern_id 非 null のユニーク数）
  const patternsDone = useMemo(() => {
    const ids = new Set<string>();
    for (const t of localTurns) {
      if (t.pattern_id) ids.add(t.pattern_id);
    }
    return ids.size;
  }, [localTurns]);

  const progress = {
    patternsDone,
    patternsTotal: session.planned_pattern_codes.length,
    elapsedSec,
    totalSec: 2400,
  };

  const patternTitleById = useCallback(
    (id: string | null) => {
      if (!id) return 'フリー質問';
      return plannedPatterns.find((p) => p.id === id)?.title ?? '不明';
    },
    [plannedPatterns],
  );

  const taskList = useMemo(() => Array.from(analysisTasks.values()), [analysisTasks]);
  const drawerTask = sessionState.openDrawerTaskId
    ? analysisTasks.get(sessionState.openDrawerTaskId) ?? null
    : null;

  const latestCompletedTask = useMemo<AnalysisTask | null>(() => {
    let latest: AnalysisTask | null = null;
    for (const t of analysisTasks.values()) {
      if (t.status === 'completed' && (!latest || t.startedAt > latest.startedAt)) {
        latest = t;
      }
    }
    return latest;
  }, [analysisTasks]);

  const futureItems = useMemo(
    () => sessionState.agenda.filter((a) => a.status === 'future'),
    [sessionState.agenda],
  );

  const newCandidatesAvailable = useMemo<{ taskId: string } | null>(() => {
    if (!latestCompletedTask) return null;
    if (sessionState.nextDraft.fromAnalysisTaskId === latestCompletedTask.turnId) return null;
    return { taskId: latestCompletedTask.turnId };
  }, [latestCompletedTask, sessionState.nextDraft.fromAnalysisTaskId]);

  return (
    <div className="relative flex h-[calc(100vh-3rem)]">
      {/* トースト通知 */}
      {toast !== null && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-800 px-5 py-3 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      <SessionAgendaSidebar
        agenda={sessionState.agenda}
        taskStatuses={sessionState.taskStatuses}
        patternsDone={patternsDone}
        patternsTotal={plannedPatterns.length}
        onItemClick={(item) => {
          if (item.status === 'future' || item.status === 'queued') {
            dispatch({
              type: 'SET_NEXT_DRAFT',
              draft: {
                questionText: item.questionText,
                source: item.source,
                patternId: item.patternId,
                fromAnalysisTaskId: null,
              },
            });
          } else if (item.analysisTaskId) {
            dispatch({ type: 'OPEN_DRAWER', turnId: item.analysisTaskId });
          }
        }}
        onAnalysisClick={(turnId) => dispatch({ type: 'OPEN_DRAWER', turnId })}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <BackgroundAnalysisStrip
          tasks={taskList}
          elapsedSec={elapsedSec}
          totalSec={2400}
          patternTitleById={patternTitleById}
          onChipClick={(turnId) => dispatch({ type: 'OPEN_DRAWER', turnId })}
        />

        {/* モード別レンダリング */}
        {mode === 'recording' && (
          <RecordingState
            currentQuestion={currentQuestion}
            patternTitle={currentPatternTitle}
            progress={progress}
            onSubmit={handleRecordingSubmit}
          />
        )}

        {mode === 'choosing' && (
          <NextQuestionPicker
            draft={sessionState.nextDraft}
            latestCompletedTask={latestCompletedTask}
            futureItems={futureItems}
            onDraftChange={(draft) => dispatch({ type: 'SET_NEXT_DRAFT', draft })}
            onStartRecording={handleStartRecording}
            newCandidatesAvailable={newCandidatesAvailable}
            onSwitchToNewerCandidates={(taskId) => {
              const t = analysisTasks.get(taskId);
              if (!t || !t.candidates) return;
              const c = t.candidates[0];
              if (!c) return;
              dispatch({
                type: 'SET_NEXT_DRAFT',
                draft: {
                  questionText: c.text,
                  source:
                    c.intent === 'deep_dive' ? { kind: 'deep_dive', parentTurnId: t.turnId }
                    : c.intent === 'meta_cognition' ? { kind: 'meta_cognition', parentTurnId: t.turnId }
                    : c.patternId ? { kind: 'pattern_intro', patternId: c.patternId }
                    : { kind: 'manual', parentTurnId: t.turnId },
                  patternId: c.patternId,
                  fromAnalysisTaskId: t.turnId,
                },
              });
            }}
          />
        )}

        {mode === 'loading' && <InterviewProgressSteps currentStep={progressStep} />}

        {mode === 'finalizing' && (
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

      {drawerTask && (
        <AnalysisResultDrawer
          task={drawerTask}
          patternTitleById={patternTitleById}
          onClose={() => dispatch({ type: 'OPEN_DRAWER', turnId: null })}
        />
      )}
    </div>
  );
}

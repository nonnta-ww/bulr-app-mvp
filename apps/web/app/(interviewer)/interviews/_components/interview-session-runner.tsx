'use client';

/**
 * InterviewSessionRunner Client Component
 *
 * ライブ面接セッションのメインオーケストレーターコンポーネント。
 * recording → choosing のモード遷移を管理し、
 * 録音送信・質問選択・面接終了の一連のフローを制御する。
 * Model B: 分析はバックグラウンドで並走し、UI は即座に picker へ遷移する。
 *
 * Requirements: 5.1, 5.3, 5.6, 6.1, 6.9, 7.12, 7.13, 7.14, 7.15
 */

import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import { buildInitialAgenda } from './agenda/build-initial-agenda';
import { buildInitialAnalysisTasks } from './agenda/build-initial-analysis-tasks';
import { sessionRunnerReducer } from './agenda/session-runner-reducer';
import type { SessionState } from './agenda/session-runner-reducer';
import type { ProgressStep } from '@/lib/interview/turns-next-events';
import type { AgendaItem, AnalysisTask, NextQuestionDraft } from './agenda/types';
import { useAnalysisTasks } from './agenda/use-analysis-tasks';
import { NextQuestionPicker, buildDraftFromCandidate } from './agenda/next-question-picker';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';


import type { InterviewSession } from '@bulr/db/schema';
import type { InterviewTurn } from '@bulr/db/schema';
import type { QuestionProposal } from '@bulr/db/schema';
import type { Candidate } from '@bulr/db/schema';
import type { AssessmentPattern } from '@bulr/db/schema';

import { RecordingState } from './recording-state';
import { SessionAgendaSidebar } from './agenda/session-agenda-sidebar';
import { BackgroundAnalysisStrip } from './agenda/background-analysis-strip';
import { AnalysisResultDrawer } from './agenda/analysis-result-drawer';
import { FinalizeDialog } from './agenda/finalize-dialog';
import { loadNextDraft, saveNextDraft, clearNextDraft } from './agenda/next-draft-storage';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface InterviewSessionRunnerProps {
  session: InterviewSession;
  turns: InterviewTurn[];
  latestProposal: QuestionProposal | null;
  candidate: Candidate;
  plannedPatterns: AssessmentPattern[];
  proposals: QuestionProposal[];
}

type Mode = 'recording' | 'choosing' | 'finalizing';

type FinalizeStep = 'idle' | 'confirm' | 'waiting';

// API が受け付ける questionSource enum
type QuestionSource = 'llm_candidate_1' | 'llm_candidate_2' | 'llm_candidate_3' | 'manual';

// ---------------------------------------------------------------------------
// pickNextDraft ヘルパー（spec §6.2 step 4 の優先順位で次の質問 draft を決定）
// ---------------------------------------------------------------------------

function pickNextDraft(
  agenda: AgendaItem[],
  tasks: Map<string, AnalysisTask>,
): NextQuestionDraft {
  // (a) 完了済み AnalysisTask の最新があれば第1候補
  let latest: AnalysisTask | null = null;
  for (const t of tasks.values()) {
    if (t.status === 'completed' && (!latest || t.startedAt > latest.startedAt)) latest = t;
  }
  if (latest && latest.candidates && latest.candidates.length > 0) {
    const c = latest.candidates[0];
    if (c) {
      return buildDraftFromCandidate(c, latest);
    }
  }
  // (b) 未着手パターンの先頭の level_1_intro
  const firstFuture = agenda.find((a) => a.status === 'future');
  if (firstFuture) {
    return {
      questionText: firstFuture.questionText,
      source: firstFuture.source,
      patternId: firstFuture.patternId,
      fromAnalysisTaskId: null,
    };
  }
  // (c) 手動入力強制
  return {
    questionText: '',
    source: { kind: 'manual', parentTurnId: null },
    patternId: null,
    fromAnalysisTaskId: null,
  };
}

// ---------------------------------------------------------------------------
// InterviewSessionRunner Component
// ---------------------------------------------------------------------------

export function InterviewSessionRunner({
  session,
  turns,
  latestProposal: _latestProposal,
  candidate: _candidate,
  plannedPatterns,
  proposals,
}: InterviewSessionRunnerProps) {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [mode, setMode] = useState<Mode>('choosing');
  const [finalizeStep, setFinalizeStep] = useState<FinalizeStep>('idle');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentTurnId, setCurrentTurnId] = useState<string>(() => nanoid(21));

  // C1: 現在の質問の出所（LLM 提案の何番目か / manual）。recording→submit で API へ送信
  const [currentQuestionSource, setCurrentQuestionSource] = useState<QuestionSource>('manual');
  // C2: proposal / pattern の現在値（FormData に append する）
  const [currentProposalId, setCurrentProposalId] = useState<string | null>(null);

  // patternId 追跡用 index。turns に既存の最終 asked_pattern_id（なければ pattern_id）があればそれを起点にする
  const [currentPatternIndex, setCurrentPatternIndex] = useState<number>(() => {
    if (plannedPatterns.length === 0) return 0;
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (!t) continue;
      const pid = t.asked_pattern_id ?? t.pattern_id;
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
    return p ? `${p.code} ${p.title}` : 'フリー質問';
  }, [plannedPatterns, currentPatternIndex]);

  // ---- 新状態モデル（Task 11: 並走、まだUI未使用） ----
  // mount 時の初期値のみ使用。props 変化に追従しない（reducer が以後の状態を管理）
  const initialAgenda = useMemo(
    () => buildInitialAgenda(plannedPatterns, turns),
    [plannedPatterns, turns],
  );

  // SSR/CSR 一致のため初期値は決定論的（localStorage は使わない）。
  // localStorage からの復元は mount 後の useEffect で SET_NEXT_DRAFT 経由で行う。
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

  // リロード後 Drawer 復元用: 過去ターンの AnalysisTask を DB データから再構築。
  // props は変化しないため useRef で初回計算を保持する（useState initializer と同様）
  const initialAnalysisTasksRef = useRef<Map<string, AnalysisTask> | null>(null);
  if (initialAnalysisTasksRef.current === null) {
    initialAnalysisTasksRef.current = buildInitialAnalysisTasks(turns, proposals);
  }
  const initialAnalysisTasks = initialAnalysisTasksRef.current;

  // reducer の taskStatuses 初期値: 過去ターンはすべて completed。同様に ref で保持
  const initialTaskStatusesRef = useRef<Record<string, { status: 'streaming' | 'completed' | 'errored'; step: ProgressStep }> | null>(null);
  if (initialTaskStatusesRef.current === null) {
    const out: Record<string, { status: 'streaming' | 'completed' | 'errored'; step: ProgressStep }> = {};
    for (const turn of turns) {
      out[turn.id] = { status: 'completed', step: 'prepare' };
    }
    initialTaskStatusesRef.current = out;
  }
  const initialTaskStatuses = initialTaskStatusesRef.current;

  const [sessionState, dispatch] = useReducer(sessionRunnerReducer, {
    agenda: initialAgenda,
    phase: 'picking',
    currentItemId: null,
    nextDraft: initialDraft,
    openDrawerTaskId: null,
    pickerDisplayedTaskId: null,
    taskStatuses: initialTaskStatuses,
  } satisfies SessionState);

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

  // nextDraft の localStorage 永続化 + リロード復元。
  // mount 直後に localStorage を読んで dispatch（hydration mismatch を避けるため初期 state では読まない）。
  // 初回 mount で default 値を save しないように hydratedRef でガード。
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const persisted = loadNextDraft(session.id);
    if (!persisted) return;
    const patternIdValid =
      persisted.patternId === null ||
      plannedPatterns.some((p) => p.id === persisted.patternId);
    let isStalePatternIntro = false;
    if (persisted.source.kind === 'pattern_intro') {
      const introPatternId = persisted.source.patternId;
      isStalePatternIntro = sessionState.agenda.some(
        (a) => a.patternId === introPatternId && a.status === 'completed',
      );
    }
    if (patternIdValid && !isStalePatternIntro) {
      dispatch({ type: 'SET_NEXT_DRAFT', draft: persisted });
    }
    // mount only — dependencies intentionally empty
  }, []);

  useEffect(() => {
    // 初回 mount は load より先に走るのでスキップ。2 回目以降の変化時のみ保存。
    if (!hydratedRef.current) return;
    saveNextDraft(session.id, sessionState.nextDraft);
  }, [session.id, sessionState.nextDraft]);

  // patternTitleById を ref に保持（useAnalysisTasks callbacks で参照できるように）
  const patternTitleByIdRef = useRef<(id: string | null) => string>(() => 'フリー質問');

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

  const { tasks: analysisTasks, spawn: spawnAnalysisTask, abortAll: abortAllAnalysisTasks, retry: retryAnalysisTask } = useAnalysisTasks(
    {
      onProgress: (turnId, step) => dispatch({ type: 'TASK_PROGRESS', turnId, step }),
      // `extras` (transcript/analysisNotes/proposalId) は省略。
      // useAnalysisTasks 内で AnalysisTask に格納済みなので analysisTasks.get(turnId) で参照可
      onCompleted: (turnId, candidates) => {
        dispatch({ type: 'TASK_COMPLETED', turnId, candidates });
        const item = sessionState.agenda.find((a) => a.id === turnId);
        const title = patternTitleByIdRef.current(item?.patternId ?? null);
        showToast(`${title} の分析が完了`);
        // §6.3: openDrawerTaskId が null なら設定（自動で待機ドロワーを開く）
        if (sessionState.openDrawerTaskId === null) {
          dispatch({ type: 'OPEN_DRAWER', turnId });
        }
      },
      onErrored: (turnId, error) => {
        dispatch({ type: 'TASK_ERRORED', turnId });
        void error;
        showToast('分析失敗。再試行できます');
      },
    },
    initialAnalysisTasks,
  );

  // ---------------------------------------------------------------------------
  // State A: recording → onSubmit ハンドラ
  // ---------------------------------------------------------------------------

  const handleRecordingSubmit = useCallback(
    async (audio: Blob, durationMs: number) => {
      const turnId = currentTurnId;

      // FormData 構築（既存と同じスキーマ）
      const formData = new FormData();
      formData.append('audio', audio);
      formData.append('turnId', turnId);
      formData.append('sessionId', session.id);
      formData.append('questionSource', currentQuestionSource);
      formData.append('questionText', currentQuestion);
      if (currentQuestionSource !== 'manual' && currentProposalId) {
        formData.append('proposalId', currentProposalId);
      }
      if (currentPatternId) {
        formData.append('patternId', currentPatternId);
      }
      formData.append('durationMs', String(durationMs));

      // 次の draft を決定 (spec §6.2 step 4)
      const nextDraft = pickNextDraft(sessionState.agenda, analysisTasks);

      // 1. 状態遷移: 現 item を asked、taskStatuses に streaming を記録、phase='picking'
      dispatch({
        type: 'SUBMIT_RECORDING',
        itemId: turnId,
        endedAt: Date.now(),
        nextDraft,
      });

      // 2. 分析タスクを spawn（背景で SSE 受信）
      spawnAnalysisTask({ turnId, patternId: currentPatternId, formData });

      // 3. UI を即 picker に（loading をスキップ）
      setMode('choosing');

      // 4. 次ターン用の turnId を準備
      setCurrentTurnId(nanoid(21));
    },
    [
      currentTurnId,
      currentQuestionSource,
      currentQuestion,
      currentProposalId,
      currentPatternId,
      session.id,
      sessionState.agenda,
      analysisTasks,
      spawnAnalysisTask,
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
  // State B: choosing → onFinalize ハンドラ
  // ---------------------------------------------------------------------------

  const handleFinalize = useCallback(async () => {
    abortAllAnalysisTasks();
    setMode('finalizing');
    dispatch({ type: 'START_FINALIZING' });
    try {
      const res = await fetch('/api/interview/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (res.ok) {
        // 面接終了時に永続化された draft をクリア（次回のセッションに紛れ込まないように）
        clearNextDraft(session.id);
        router.push('/interviews/' + session.id + '/report');
      } else {
        showToast('エラーが発生しました');
        setMode('choosing');
      }
    } catch {
      showToast('エラーが発生しました');
      setMode('choosing');
    }
  }, [abortAllAnalysisTasks, session.id, router, showToast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // 完了したパターン coverage 数（sessionState.agenda の completed item から算出）
  const patternsDone = useMemo(() => {
    const ids = new Set<string>();
    for (const a of sessionState.agenda) {
      if (a.status === 'completed' && a.patternId) ids.add(a.patternId);
    }
    return ids.size;
  }, [sessionState.agenda]);

  const progress = {
    patternsDone,
    patternsTotal: session.planned_pattern_codes.length,
    elapsedSec,
    totalSec: 2400,
  };

  const patternTitleById = useCallback(
    (id: string | null) => {
      if (!id) return 'フリー質問';
      const p = plannedPatterns.find((p) => p.id === id);
      return p ? `${p.code} ${p.title}` : '不明';
    },
    [plannedPatterns],
  );

  // Update ref for useAnalysisTasks callbacks
  useEffect(() => {
    patternTitleByIdRef.current = patternTitleById;
  }, [patternTitleById]);

  const taskList = useMemo(() => Array.from(analysisTasks.values()), [analysisTasks]);

  const pendingTasks = useMemo(
    () => taskList.filter((t) => t.status === 'streaming'),
    [taskList],
  );

  // 待機モード中に全タスクが完了/エラーになったら自動ファイナライズ
  useEffect(() => {
    if (finalizeStep === 'waiting' && pendingTasks.length === 0) {
      void handleFinalize();
    }
  }, [finalizeStep, pendingTasks.length, handleFinalize]);

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

  // 候補表示用のタスク。優先度:
  //   (1) pickerDisplayedTaskId — チップ/履歴クリックで明示的に指定された task
  //   (2) draft.fromAnalysisTaskId — ピッカーで選択中の draft の出所 task
  //   (3) latestCompletedTask — 上記が無ければ最新完了
  const displayedTask = useMemo<AnalysisTask | null>(() => {
    const explicitId = sessionState.pickerDisplayedTaskId;
    if (explicitId) {
      const t = analysisTasks.get(explicitId);
      if (t && t.candidates && t.candidates.length > 0) return t;
    }
    const draftId = sessionState.nextDraft.fromAnalysisTaskId;
    if (draftId) {
      const t = analysisTasks.get(draftId);
      if (t && t.candidates && t.candidates.length > 0) return t;
    }
    return latestCompletedTask;
  }, [
    sessionState.pickerDisplayedTaskId,
    sessionState.nextDraft.fromAnalysisTaskId,
    analysisTasks,
    latestCompletedTask,
  ]);

  const futureItems = useMemo(
    () => sessionState.agenda.filter((a) => a.status === 'future'),
    [sessionState.agenda],
  );

  // displayedTask より新しい完了タスクがあれば [切替] リンクを出す
  const newCandidatesAvailable = useMemo<{ taskId: string } | null>(() => {
    if (!latestCompletedTask) return null;
    if (!displayedTask) {
      // まだ表示中タスクが無い場合（初期状態など）は、最新があれば即提示
      return { taskId: latestCompletedTask.turnId };
    }
    if (displayedTask.turnId === latestCompletedTask.turnId) return null;
    return { taskId: latestCompletedTask.turnId };
  }, [latestCompletedTask, displayedTask]);

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
        onItemRetry={retryAnalysisTask}
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
            dispatch({ type: 'SET_PICKER_DISPLAYED_TASK', turnId: item.analysisTaskId });
          }
        }}
        onAnalysisClick={(turnId) => {
          dispatch({ type: 'OPEN_DRAWER', turnId });
          dispatch({ type: 'SET_PICKER_DISPLAYED_TASK', turnId });
        }}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <BackgroundAnalysisStrip
              tasks={taskList}
              elapsedSec={elapsedSec}
              totalSec={2400}
              patternTitleById={patternTitleById}
              onChipClick={(turnId) => {
                dispatch({ type: 'OPEN_DRAWER', turnId });
                dispatch({ type: 'SET_PICKER_DISPLAYED_TASK', turnId });
              }}
              onRetry={retryAnalysisTask}
            />
          </div>
          <button
            type="button"
            onClick={() => setFinalizeStep('confirm')}
            className="shrink-0 rounded border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            面接終了
          </button>
        </div>

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
            displayedTask={displayedTask}
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
                draft: buildDraftFromCandidate(c, t),
              });
            }}
          />
        )}

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

      <FinalizeDialog
        open={finalizeStep === 'confirm' || finalizeStep === 'waiting'}
        mode={finalizeStep === 'waiting' ? 'waiting' : 'confirm'}
        pendingTasks={pendingTasks}
        patternTitleById={patternTitleById}
        onWait={() => setFinalizeStep('waiting')}
        onForceClose={() => {
          setFinalizeStep('idle');
          void handleFinalize();
        }}
        onCancel={() => setFinalizeStep('idle')}
      />
    </div>
  );
}

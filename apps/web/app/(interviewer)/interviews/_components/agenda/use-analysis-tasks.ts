'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSseStream, StreamEndedWithoutTerminalEvent } from '@/lib/interview/parse-sse-stream';
import { TurnsNextEvent } from '@/lib/interview/turns-next-events';
import type { ProgressStep } from '@/lib/interview/turns-next-events';
import type { AnalysisCandidate, AnalysisTask } from './types';

export interface UseAnalysisTasksCallbacks {
  onProgress: (turnId: string, step: ProgressStep) => void;
  onCompleted: (
    turnId: string,
    candidates: AnalysisCandidate[],
    extras: { transcript: string; analysisNotes: string; proposalId: string | null },
  ) => void;
  onErrored: (turnId: string, error: string) => void;
}

export interface SpawnInput {
  turnId: string;
  patternId: string | null;
  formData: FormData;
}

export function useAnalysisTasks(callbacks: UseAnalysisTasksCallbacks) {
  const [tasks, setTasks] = useState<Map<string, AnalysisTask>>(() => new Map());
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // unmount で全 task abort（実行中の fetch を解放）
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  useEffect(() => {
    return () => {
      tasksRef.current.forEach((task) => task.abortController.abort());
    };
  }, []);

  const patchTask = useCallback((turnId: string, patch: Partial<AnalysisTask>) => {
    setTasks((prev) => {
      const cur = prev.get(turnId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(turnId, { ...cur, ...patch });
      return next;
    });
  }, []);

  const spawn = useCallback(
    ({ turnId, patternId, formData }: SpawnInput) => {
      const abortController = new AbortController();
      const task: AnalysisTask = {
        turnId,
        patternId,
        status: 'streaming',
        step: 'upload',
        transcript: null,
        analysisNotes: null,
        candidates: null,
        proposalId: null,
        error: null,
        abortController,
        startedAt: Date.now(),
        retryFormData: formData,
      };

      setTasks((prev) => {
        const next = new Map(prev);
        next.set(turnId, task);
        return next;
      });

      void runAnalysis(formData, abortController, turnId, callbacksRef, patchTask);
    },
    [patchTask],
  );

  const abortAll = useCallback(() => {
    tasksRef.current.forEach((task) => task.abortController.abort());
  }, []);

  const retry = useCallback(
    (turnId: string) => {
      const existing = tasksRef.current.get(turnId);
      if (!existing) return;
      // Abort previous (if still running) and spawn again with same params
      existing.abortController.abort();
      spawn({ turnId, patternId: existing.patternId, formData: existing.retryFormData });
    },
    [spawn],
  );

  return { tasks, spawn, abortAll, retry };
}

async function runAnalysis(
  formData: FormData,
  abortController: AbortController,
  turnId: string,
  callbacksRef: React.MutableRefObject<UseAnalysisTasksCallbacks>,
  patchTask: (turnId: string, patch: Partial<AnalysisTask>) => void,
) {
  try {
    const res = await fetch('/api/interview/turns/next', {
      method: 'POST',
      body: formData,
      signal: abortController.signal,
    });

    if (!res.ok || !res.body) {
      const msg = !res.ok ? `HTTP ${res.status}` : 'No response body';
      patchTask(turnId, { status: 'errored', error: msg });
      callbacksRef.current.onErrored(turnId, msg);
      return;
    }

    const reader = res.body.getReader();
    for await (const event of parseSseStream(
      reader,
      TurnsNextEvent,
      (e) => e.type !== 'progress',
    )) {
      if (event.type === 'progress') {
        patchTask(turnId, { step: event.step });
        callbacksRef.current.onProgress(turnId, event.step);
        continue;
      }

      if (event.type === 'complete') {
        const transcript = event.turn.transcript?.candidate ?? '';
        const analysisNotes = event.turn.llm_analysis?.notes ?? '';
        const proposal = event.proposal;
        const candidates: AnalysisCandidate[] = proposal
          ? [
              { text: proposal.candidate_1_text, intent: proposal.candidate_1_intent, patternId: null },
              { text: proposal.candidate_2_text, intent: proposal.candidate_2_intent, patternId: null },
              { text: proposal.candidate_3_text, intent: proposal.candidate_3_intent, patternId: null },
            ]
          : [];
        const proposalId = proposal?.id ?? null;
        patchTask(turnId, {
          status: 'completed',
          step: 'prepare',
          transcript,
          analysisNotes,
          candidates,
          proposalId,
        });
        callbacksRef.current.onCompleted(turnId, candidates, { transcript, analysisNotes, proposalId });
        return;
      }

      if (event.type === 'error') {
        const message = event.message ?? event.code;
        patchTask(turnId, { status: 'errored', error: message });
        callbacksRef.current.onErrored(turnId, message);
        return;
      }
    }
    throw new StreamEndedWithoutTerminalEvent();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    const message =
      e instanceof StreamEndedWithoutTerminalEvent
        ? 'stream ended without terminal event'
        : e instanceof Error
          ? e.message
          : 'unknown';
    patchTask(turnId, { status: 'errored', error: message });
    callbacksRef.current.onErrored(turnId, message);
  }
}

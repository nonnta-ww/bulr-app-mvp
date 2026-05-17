import type { AgendaItem, AnalysisCandidate, NextQuestionDraft, Phase } from './types';
import type { ProgressStep } from '@/lib/interview/turns-next-events';

export interface SessionState {
  agenda: AgendaItem[];
  phase: Phase;
  currentItemId: string | null;
  nextDraft: NextQuestionDraft;
  openDrawerTaskId: string | null;
  // analysisTasks 本体は別 hook で管理。Reducer は status のみ追跡
  taskStatuses: Record<string, { status: 'streaming' | 'completed' | 'errored'; step: ProgressStep }>;
}

export type SessionAction =
  | { type: 'START_RECORDING'; itemId: string; startedAt: number }
  | { type: 'SUBMIT_RECORDING'; itemId: string; endedAt: number; nextDraft: NextQuestionDraft }
  | { type: 'SET_NEXT_DRAFT'; draft: NextQuestionDraft }
  | { type: 'TASK_PROGRESS'; turnId: string; step: ProgressStep }
  | { type: 'TASK_COMPLETED'; turnId: string; candidates: AnalysisCandidate[] }
  | { type: 'TASK_ERRORED'; turnId: string }
  | { type: 'OPEN_DRAWER'; turnId: string | null }
  | { type: 'START_FINALIZING' };

export function sessionRunnerReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'START_RECORDING': {
      const idx = state.agenda.findIndex((a) => a.id === action.itemId);
      const updated =
        idx >= 0
          ? state.agenda.map((a, i) =>
              i === idx ? { ...a, status: 'recording' as const, startedAt: action.startedAt } : a,
            )
          : [
              ...state.agenda,
              {
                id: action.itemId,
                patternId: state.nextDraft.patternId,
                patternTitle: '',
                questionText: state.nextDraft.questionText,
                source: state.nextDraft.source,
                status: 'recording' as const,
                startedAt: action.startedAt,
                endedAt: null,
                analysisTaskId: null,
              },
            ];
      return {
        ...state,
        agenda: updated,
        phase: 'recording',
        currentItemId: action.itemId,
      };
    }

    case 'SUBMIT_RECORDING': {
      return {
        ...state,
        agenda: state.agenda.map((a) =>
          a.id === action.itemId
            ? { ...a, status: 'asked' as const, endedAt: action.endedAt, analysisTaskId: a.id }
            : a,
        ),
        phase: 'picking',
        currentItemId: null,
        nextDraft: action.nextDraft,
        taskStatuses: {
          ...state.taskStatuses,
          [action.itemId]: { status: 'streaming', step: 'upload' },
        },
      };
    }

    case 'SET_NEXT_DRAFT':
      return { ...state, nextDraft: action.draft };

    case 'TASK_PROGRESS':
      return {
        ...state,
        taskStatuses: {
          ...state.taskStatuses,
          [action.turnId]: { status: 'streaming', step: action.step },
        },
      };

    case 'TASK_COMPLETED': {
      const prev = state.taskStatuses[action.turnId];
      return {
        ...state,
        taskStatuses: {
          ...state.taskStatuses,
          [action.turnId]: { status: 'completed', step: prev?.step ?? 'prepare' },
        },
        agenda: state.agenda.map((a) =>
          a.id === action.turnId ? { ...a, status: 'completed' as const } : a,
        ),
      };
    }

    case 'TASK_ERRORED': {
      const prev = state.taskStatuses[action.turnId];
      return {
        ...state,
        taskStatuses: {
          ...state.taskStatuses,
          [action.turnId]: { status: 'errored', step: prev?.step ?? 'upload' },
        },
      };
    }

    case 'OPEN_DRAWER':
      return { ...state, openDrawerTaskId: action.turnId };

    case 'START_FINALIZING':
      return { ...state, phase: 'finalizing' };

    default:
      return state;
  }
}

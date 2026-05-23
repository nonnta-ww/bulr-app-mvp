import type { AgendaItem, AnalysisCandidate, NextQuestionDraft, Phase } from './types';
import type { ProgressStep } from '@/lib/interview/turns-next-events';

export interface SessionState {
  agenda: AgendaItem[];
  phase: Phase;
  currentItemId: string | null;
  nextDraft: NextQuestionDraft;
  openDrawerTaskId: string | null;
  // ピッカーで候補3つを表示するタスク ID。null のときは nextDraft.fromAnalysisTaskId にフォールバック。
  // 背景タスクチップやサイドバー履歴クリックで「過去の分析候補をピッカーで見たい」操作を可能にする。
  pickerDisplayedTaskId: string | null;
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
  | { type: 'SET_PICKER_DISPLAYED_TASK'; turnId: string | null }
  | { type: 'START_FINALIZING' };

export function sessionRunnerReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'START_RECORDING': {
      // pattern_intro の場合は対応する draft-${patternId} を置換、それ以外は末尾に追加
      const draftId =
        state.nextDraft.source.kind === 'pattern_intro'
          ? `draft-${state.nextDraft.source.patternId}`
          : null;
      const draftIdx = draftId ? state.agenda.findIndex((a) => a.id === draftId) : -1;
      const existingPatternTitle =
        draftIdx >= 0 ? state.agenda[draftIdx]?.patternTitle ?? '' : '';

      const newItem: AgendaItem = {
        id: action.itemId,
        patternId: state.nextDraft.patternId,
        patternTitle: existingPatternTitle,
        questionText: state.nextDraft.questionText,
        source: state.nextDraft.source,
        status: 'recording',
        startedAt: action.startedAt,
        endedAt: null,
        analysisTaskId: null,
      };

      const updated = [...state.agenda];
      if (draftIdx >= 0) {
        updated.splice(draftIdx, 1, newItem); // pattern_intro: 置換
      } else {
        updated.push(newItem); // deep_dive / meta_cognition / manual: 末尾追加
      }

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
        pickerDisplayedTaskId: null,
        taskStatuses: {
          ...state.taskStatuses,
          [action.itemId]: { status: 'streaming', step: 'upload' },
        },
      };
    }

    case 'SET_NEXT_DRAFT':
      // 候補をピックしたら表示も draft 基準に戻す（明示ピック後の display ロックは不要）
      return { ...state, nextDraft: action.draft, pickerDisplayedTaskId: null };

    case 'SET_PICKER_DISPLAYED_TASK':
      return { ...state, pickerDisplayedTaskId: action.turnId };

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

/**
 * Agenda + 並走分析タスク用の型定義。
 * spec: docs/superpowers/specs/2026-05-17-interview-session-ux-overhaul-design.md §4
 */

import type { ProgressStep } from '@/lib/interview/turns-next-events';

// ---- agenda ----

export type AgendaItemStatus =
  | 'future'      // 未着手 plannedPattern の level_1_intro
  | 'queued'      // NextQuestionPicker で選択中（未録音）
  | 'recording'   // 録音中
  | 'asked'       // 録音終了済み（分析中含む）
  | 'completed';  // 分析も完了

export type AgendaItemSource =
  | { kind: 'pattern_intro'; patternId: string }
  | { kind: 'deep_dive'; parentTurnId: string }
  | { kind: 'meta_cognition'; parentTurnId: string }
  | { kind: 'manual'; parentTurnId: string | null };

export interface AgendaItem {
  id: string; // turnId (録音中以降) / `draft-${nanoid}` (未録音)
  patternId: string | null;
  patternTitle: string; // 表示用。level_1_intro の場合はパターン title、フリー質問は "フリー質問"
  questionText: string;
  source: AgendaItemSource;
  status: AgendaItemStatus;
  startedAt: number | null;
  endedAt: number | null;
  analysisTaskId: string | null; // 紐づく AnalysisTask の turnId（= AgendaItem.id と同じ）
}

// ---- 分析タスク ----

export type AnalysisStatus = 'streaming' | 'completed' | 'errored';

export interface AnalysisCandidate {
  text: string;
  intent: 'deep_dive' | 'meta_cognition' | 'next_pattern';
  patternId: string | null;
}

export interface AnalysisTask {
  turnId: string;
  patternId: string | null;
  status: AnalysisStatus;
  step: ProgressStep;
  transcript: string | null;
  analysisNotes: string | null;
  candidates: AnalysisCandidate[] | null;
  proposalId: string | null;
  error: string | null;
  abortController: AbortController;
  startedAt: number;
}

// ---- ピッカードラフト ----

export interface NextQuestionDraft {
  questionText: string;
  source: AgendaItemSource;
  patternId: string | null;
  fromAnalysisTaskId: string | null;
}

// ---- フェーズ ----

export type Phase = 'picking' | 'recording' | 'finalizing';

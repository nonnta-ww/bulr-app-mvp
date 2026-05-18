import type { InterviewTurn, AssessmentPattern } from '@bulr/db/schema';
import type { AgendaItem, AgendaItemSource } from './types';

/**
 * plannedPatterns と過去 turns から AgendaItem[] を決定論的に構築する純関数。
 *
 * - 過去 turns は順序通り。pattern_id が一致するパターンの直下にぶら下がる。
 * - manual turn は親パターン（pattern_id があれば）か末尾の `manual` グループに。
 * - 未録音パターンの level_1_intro が末尾に `future` で並ぶ。
 */
export function buildInitialAgenda(
  plannedPatterns: readonly AssessmentPattern[],
  turns: readonly InterviewTurn[],
): AgendaItem[] {
  const items: AgendaItem[] = [];
  const consumedPatternIds = new Set<string>();

  for (const turn of turns) {
    const source = restoreSource(turn);
    const pattern = turn.pattern_id
      ? plannedPatterns.find((p) => p.id === turn.pattern_id) ?? null
      : null;

    if (pattern && source.kind === 'pattern_intro') {
      consumedPatternIds.add(pattern.id);
    }

    items.push({
      id: turn.id,
      patternId: pattern?.id ?? null,
      patternTitle: pattern?.title ?? 'フリー質問',
      questionText: turn.question_text ?? '',
      source,
      status: 'completed',
      startedAt: turn.created_at ? new Date(turn.created_at).getTime() : null,
      endedAt: turn.created_at ? new Date(turn.created_at).getTime() : null,
      analysisTaskId: turn.id,
    });
  }

  for (const pattern of plannedPatterns) {
    if (consumedPatternIds.has(pattern.id)) continue;
    items.push({
      id: `draft-${pattern.id}`,
      patternId: pattern.id,
      patternTitle: pattern.title,
      questionText: pattern.level_1_intro,
      source: { kind: 'pattern_intro', patternId: pattern.id },
      status: 'future',
      startedAt: null,
      endedAt: null,
      analysisTaskId: null,
    });
  }

  return items;
}

function restoreSource(turn: InterviewTurn): AgendaItemSource {
  const qs = turn.question_source;
  if (qs === 'llm_candidate_1' || qs === 'llm_candidate_2' || qs === 'llm_candidate_3') {
    return { kind: 'deep_dive', parentTurnId: turn.id };
  }
  if (turn.pattern_id) {
    return { kind: 'pattern_intro', patternId: turn.pattern_id };
  }
  return { kind: 'manual', parentTurnId: null };
}

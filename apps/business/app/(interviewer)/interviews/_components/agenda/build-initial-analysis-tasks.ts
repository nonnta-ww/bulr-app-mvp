import type { InterviewTurn, QuestionProposal } from '@bulr/db/schema';
import type { AnalysisCandidate, AnalysisTask } from './types';

/**
 * 過去ターンと proposals から AnalysisTask Map を決定論的に構築する純関数。
 * リロード時の Drawer 表示用。
 *
 * - 各 turn の transcript / llm_analysis.notes を AnalysisTask に詰める
 * - prepared_for_turn_no = turn.sequence_no + 1 の proposal を candidates に展開
 * - status は常に 'completed'、step は 'prepare'
 * - abortController は即 abort 済みのものを置く（既に完了しているため）
 * - retryFormData は空 FormData（再試行不可）
 */
export function buildInitialAnalysisTasks(
  turns: readonly InterviewTurn[],
  proposals: readonly QuestionProposal[],
): Map<string, AnalysisTask> {
  const map = new Map<string, AnalysisTask>();
  for (const turn of turns) {
    const proposal = proposals.find((p) => p.prepared_for_turn_no === turn.sequence_no + 1);
    const candidates: AnalysisCandidate[] = proposal
      ? [
          {
            text: proposal.candidate_1_text,
            intent: proposal.candidate_1_intent,
            patternId: null,
          },
          {
            text: proposal.candidate_2_text,
            intent: proposal.candidate_2_intent,
            patternId: null,
          },
          {
            text: proposal.candidate_3_text,
            intent: proposal.candidate_3_intent,
            patternId: null,
          },
        ]
      : [];
    const abortController = new AbortController();
    abortController.abort(); // 既に完了している
    const transcript =
      turn.transcript && typeof turn.transcript === 'object' && 'candidate' in turn.transcript
        ? String((turn.transcript as { candidate?: string }).candidate ?? '')
        : '';
    const analysisNotes =
      turn.llm_analysis && typeof turn.llm_analysis === 'object' && 'notes' in turn.llm_analysis
        ? String((turn.llm_analysis as { notes?: string }).notes ?? '')
        : '';
    map.set(turn.id, {
      turnId: turn.id,
      patternId: turn.asked_pattern_id ?? turn.pattern_id ?? null,
      questionText: turn.question_text ?? null,
      status: 'completed',
      step: 'prepare',
      transcript,
      analysisNotes,
      candidates,
      proposalId: proposal?.id ?? null,
      error: null,
      abortController,
      startedAt: turn.created_at ? new Date(turn.created_at).getTime() : Date.now(),
      retryFormData: new FormData(),
    });
  }
  return map;
}

import { asc, eq } from 'drizzle-orm';
import type { LlmEvaluation, ManualEvaluation } from '@bulr/types/evaluation';

import { db } from '../../client';
import { assessmentPattern } from '../../schema/assessment-pattern';
import { user } from '../../schema/auth';
import { candidate } from '../../schema/candidate';
import { candidateProfile } from '../../schema/candidate-profile';
import { entry } from '../../schema/entry';
import { interviewSession } from '../../schema/interview-session';
import { interviewTurn } from '../../schema/interview-turn';
import { opening } from '../../schema/opening';
import { patternCoverage } from '../../schema/pattern-coverage';
import { userProfile } from '../../schema/user-profile';
import type { AssessmentPattern } from '../../schema/assessment-pattern';
import type { Candidate } from '../../schema/candidate';
import type { InterviewSession } from '../../schema/interview-session';
import type { InterviewTurn } from '../../schema/interview-turn';

// -----------------------------------------------------------------------
// 公開型
// -----------------------------------------------------------------------

export type SessionDetailInterviewer = {
  email: string;
  displayName: string;
  roleInOrg: string | null;
};

export type SessionDetailCoverage = {
  id: string;
  pattern: AssessmentPattern;
  levelReached: number;
  stuckType: 'not_experienced' | 'shallow' | 'single_option' | 'rigid' | null;
  llmEvaluation: LlmEvaluation;
  manualEvaluation: ManualEvaluation | null;
  turnIds: string[];
  finalizedAt: Date;
};

export type SessionDetail = {
  session: InterviewSession;
  candidate: Candidate;
  interviewer: SessionDetailInterviewer;
  turns: InterviewTurn[];
  coverages: SessionDetailCoverage[];
};

// -----------------------------------------------------------------------
// メインクエリ関数
// -----------------------------------------------------------------------

/**
 * セッション詳細を一括取得する（≤ 3 クエリ、N+1 防止）。
 *
 * クエリ構成:
 *   1. session + candidate + user (面接官) + user_profile を 1 クエリで取得
 *   2. interview_turn[] を sequence_no 昇順で取得
 *   3. pattern_coverage[] + 関連 assessment_pattern を pattern_code 昇順で取得
 *
 * @param sessionId - 取得対象のセッション ID
 * @returns SessionDetail | null（セッションが存在しない場合は null）
 */
export async function sessionDetailQuery(
  sessionId: string,
): Promise<SessionDetail | null> {
  // ----------------------------------------------------------------
  // クエリ 1: session + candidate + user (面接官) + user_profile
  //           entry 経由セッション（stage2）では candidate_id が NULL のため
  //           LEFT JOIN を使用し、entry → opening → candidateProfile も取得する
  // ----------------------------------------------------------------
  const sessionRows = await db
    .select({
      session: interviewSession,
      candidate: candidate,
      userEmail: user.email,
      userDisplayName: userProfile.displayName,
      userRoleInOrg: userProfile.roleInOrg,
      // stage2 フィールド（entry 経由セッションのみ）
      candidateProfileDisplayName: candidateProfile.displayName,
      openingTitle: opening.title,
    })
    .from(interviewSession)
    .leftJoin(candidate, eq(interviewSession.candidate_id, candidate.id))
    .innerJoin(user, eq(interviewSession.interviewer_id, user.id))
    .leftJoin(userProfile, eq(interviewSession.interviewer_id, userProfile.userId))
    .leftJoin(entry, eq(interviewSession.entry_id, entry.id))
    .leftJoin(opening, eq(entry.openingId, opening.id))
    .leftJoin(candidateProfile, eq(entry.candidateProfileId, candidateProfile.id))
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  if (sessionRows.length === 0) {
    return null;
  }

  const sessionRow = sessionRows[0]!;

  // ----------------------------------------------------------------
  // クエリ 2: interview_turn[] — sequence_no 昇順
  // ----------------------------------------------------------------
  const turns = await db
    .select()
    .from(interviewTurn)
    .where(eq(interviewTurn.session_id, sessionId))
    .orderBy(asc(interviewTurn.sequence_no));

  // ----------------------------------------------------------------
  // クエリ 3: pattern_coverage[] + assessment_pattern — pattern_code 昇順
  // ----------------------------------------------------------------
  const coverageRows = await db
    .select({
      coverage: patternCoverage,
      pattern: assessmentPattern,
    })
    .from(patternCoverage)
    .innerJoin(assessmentPattern, eq(patternCoverage.pattern_id, assessmentPattern.id))
    .where(eq(patternCoverage.session_id, sessionId))
    .orderBy(asc(assessmentPattern.code));

  // ----------------------------------------------------------------
  // 結果の組み立て
  // ----------------------------------------------------------------
  const interviewer: SessionDetailInterviewer = {
    email: sessionRow.userEmail,
    displayName: sessionRow.userDisplayName ?? sessionRow.userEmail,
    roleInOrg: sessionRow.userRoleInOrg ?? null,
  };

  // stage2 セッション（candidate_id=NULL, entry_id あり）の場合は
  // candidateProfile / opening の情報から合成 Candidate を構築する。
  // これにより CSV/JSON エクスポートが entry 経由セッションでも正常動作する（要件 8.4）。
  const resolvedCandidate: Candidate = sessionRow.candidate ?? {
    id: '',
    name: sessionRow.candidateProfileDisplayName ?? '—',
    applied_role: sessionRow.openingTitle ?? '—',
    background_summary: '',
    email: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  };

  const coverages: SessionDetailCoverage[] = coverageRows.map((row) => ({
    id: row.coverage.id,
    pattern: row.pattern,
    levelReached: row.coverage.level_reached,
    stuckType: row.coverage.stuck_type,
    llmEvaluation: row.coverage.llm_evaluation as LlmEvaluation,
    manualEvaluation: (row.coverage.manual_evaluation as ManualEvaluation | null) ?? null,
    turnIds: row.coverage.turn_ids,
    finalizedAt: row.coverage.finalized_at,
  }));

  return {
    session: sessionRow.session,
    candidate: resolvedCandidate,
    interviewer,
    turns,
    coverages,
  };
}

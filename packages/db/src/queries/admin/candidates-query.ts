import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '../../client';
import { user } from '../../schema/auth';
import { candidateProfile } from '../../schema/candidate-profile';
import { mockInterview } from '../../schema/mock-interview';
import { resumeDocument } from '../../schema/resume-document';
import { skillSurvey } from '../../schema/skill-survey';
import { skillSurveyResponse } from '../../schema/skill-survey-response';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export interface CandidateListItem {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  quotaResetAt: Date | null;
  usedThisMonth: number; // mock_interview 当月件数（quota_reset_at 考慮）
  surveyCompleted: boolean; // skill_survey_response 存在フラグ
  createdAt: Date;
}

export interface CandidateProfileDetail {
  profile: {
    id: string;
    displayName: string;
    headline: string | null;
    isActive: boolean;
    quotaResetAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    email: string;
  };
  resumeDocuments: Array<{
    id: string;
    fileType: string;
    blobUrl: string;
    createdAt: Date;
  }>;
  surveyResponses: Array<{
    surveyId: string;
    jobType: string;
    submittedAt: Date;
  }>;
  mockInterviews: Array<{
    id: string;
    patternCode: string;
    startedAt: Date;
    endedAt: Date | null;
    turnCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// getCandidatesForAdmin
// ---------------------------------------------------------------------------

/**
 * 管理者向け候補者一覧クエリ。
 *
 * - search: displayName または email の部分一致フィルタ（ILIKE）
 * - isActive: is_active フィルタ（undefined の場合は全件）
 * - page / pageSize: ページング（LIMIT/OFFSET）
 *
 * usedThisMonth は「クォータウィンドウ内」の mock_interview 件数。
 * ウィンドウ = GREATEST(date_trunc('month', now()), COALESCE(quota_reset_at, date_trunc('month', now())))
 * COALESCE により quota_reset_at が NULL でも月初が基準となり、NULL 返却を回避する。
 */
export async function getCandidatesForAdmin(params: {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}): Promise<{ items: CandidateListItem[]; total: number }> {
  const { search, isActive, page, pageSize } = params;

  // ------------------------------------------------------------------
  // WHERE 条件の構築
  // ------------------------------------------------------------------
  const conditions: SQL[] = [];

  if (search !== undefined && search.trim() !== '') {
    const pattern = `%${search.trim()}%`;
    const searchCondition = or(
      ilike(candidateProfile.displayName, pattern),
      ilike(user.email, pattern),
    );
    if (searchCondition !== undefined) {
      conditions.push(searchCondition);
    }
  }

  if (isActive !== undefined) {
    conditions.push(eq(candidateProfile.isActive, isActive));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  // ------------------------------------------------------------------
  // クォータウィンドウ式（SQL レベルで計算）
  // GREATEST(date_trunc('month', now()), COALESCE(quota_reset_at, date_trunc('month', now())))
  // ------------------------------------------------------------------
  const quotaWindowStart = sql`GREATEST(
    date_trunc('month', now()),
    COALESCE(${candidateProfile.quotaResetAt}, date_trunc('month', now()))
  )`;

  // ------------------------------------------------------------------
  // usedThisMonth: 相関サブクエリ（NULL-safe: COALESCE により 0 を保証）
  // ------------------------------------------------------------------
  const usedThisMonthSql = sql<number>`COALESCE((
    SELECT COUNT(*)
    FROM mock_interview mi
    WHERE mi.candidate_profile_id = ${candidateProfile.id}
      AND mi.created_at >= ${quotaWindowStart}
  ), 0)`;

  // ------------------------------------------------------------------
  // surveyCompleted: 存在確認サブクエリ
  // ------------------------------------------------------------------
  const surveyCompletedSql = sql<boolean>`EXISTS (
    SELECT 1
    FROM skill_survey_response ssr
    WHERE ssr.candidate_profile_id = ${candidateProfile.id}
  )`;

  // ------------------------------------------------------------------
  // データ取得クエリ
  // ------------------------------------------------------------------
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      id: candidateProfile.id,
      displayName: candidateProfile.displayName,
      email: user.email,
      isActive: candidateProfile.isActive,
      quotaResetAt: candidateProfile.quotaResetAt,
      usedThisMonth: usedThisMonthSql,
      surveyCompleted: surveyCompletedSql,
      createdAt: candidateProfile.createdAt,
    })
    .from(candidateProfile)
    .innerJoin(user, eq(candidateProfile.userId, user.id))
    .where(whereClause)
    .orderBy(candidateProfile.createdAt)
    .limit(pageSize)
    .offset(offset);

  // ------------------------------------------------------------------
  // 件数クエリ（total）
  // ------------------------------------------------------------------
  const countRows = await db
    .select({ total: count() })
    .from(candidateProfile)
    .innerJoin(user, eq(candidateProfile.userId, user.id))
    .where(whereClause);

  const total = Number(countRows[0]?.total ?? 0);

  // ------------------------------------------------------------------
  // 戻り値マッピング
  // ------------------------------------------------------------------
  const items: CandidateListItem[] = rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    isActive: row.isActive,
    quotaResetAt: row.quotaResetAt ?? null,
    usedThisMonth: Number(row.usedThisMonth),
    surveyCompleted: Boolean(row.surveyCompleted),
    createdAt: row.createdAt,
  }));

  return { items, total };
}

// ---------------------------------------------------------------------------
// getCandidateProfileDetail
// ---------------------------------------------------------------------------

/**
 * 候補者詳細クエリ。指定 ID の候補者プロファイルと関連データを返す。
 * 存在しない場合は undefined を返す。
 */
export async function getCandidateProfileDetail(
  candidateProfileId: string,
): Promise<CandidateProfileDetail | undefined> {
  // ------------------------------------------------------------------
  // プロファイル基本情報（user JOIN）
  // ------------------------------------------------------------------
  const profileRows = await db
    .select({
      id: candidateProfile.id,
      displayName: candidateProfile.displayName,
      headline: candidateProfile.headline,
      isActive: candidateProfile.isActive,
      quotaResetAt: candidateProfile.quotaResetAt,
      createdAt: candidateProfile.createdAt,
      updatedAt: candidateProfile.updatedAt,
      email: user.email,
    })
    .from(candidateProfile)
    .innerJoin(user, eq(candidateProfile.userId, user.id))
    .where(eq(candidateProfile.id, candidateProfileId))
    .limit(1);

  const profile = profileRows[0];
  if (!profile) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // 模擬面接履歴
  // ------------------------------------------------------------------
  const mockInterviewRows = await db
    .select({
      id: mockInterview.id,
      patternCode: mockInterview.patternCode,
      startedAt: mockInterview.startedAt,
      endedAt: mockInterview.endedAt,
      turnCount: mockInterview.turnCount,
    })
    .from(mockInterview)
    .where(eq(mockInterview.candidateProfileId, candidateProfileId))
    .orderBy(mockInterview.startedAt);

  // ------------------------------------------------------------------
  // アンケート回答一覧（skill_survey JOIN で jobType を取得）
  // ------------------------------------------------------------------
  const surveyRows = await db
    .select({
      surveyId: skillSurveyResponse.skillSurveyId,
      jobType: skillSurvey.jobType,
      submittedAt: skillSurveyResponse.submittedAt,
    })
    .from(skillSurveyResponse)
    .innerJoin(skillSurvey, eq(skillSurveyResponse.skillSurveyId, skillSurvey.id))
    .where(eq(skillSurveyResponse.candidateProfileId, candidateProfileId))
    .orderBy(skillSurveyResponse.submittedAt);

  // ------------------------------------------------------------------
  // 履歴書ドキュメント一覧
  // resume_document.kind（pgEnum）を fileType として公開する
  // ------------------------------------------------------------------
  const resumeRows = await db
    .select({
      id: resumeDocument.id,
      fileType: resumeDocument.kind,
      blobUrl: resumeDocument.blobUrl,
      createdAt: resumeDocument.createdAt,
    })
    .from(resumeDocument)
    .where(eq(resumeDocument.candidateProfileId, candidateProfileId))
    .orderBy(resumeDocument.createdAt);

  // ------------------------------------------------------------------
  // 結果の組み立て
  // ------------------------------------------------------------------
  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      headline: profile.headline ?? null,
      isActive: profile.isActive,
      quotaResetAt: profile.quotaResetAt ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      email: profile.email,
    },
    resumeDocuments: resumeRows.map((r) => ({
      id: r.id,
      fileType: r.fileType,
      blobUrl: r.blobUrl,
      createdAt: r.createdAt,
    })),
    surveyResponses: surveyRows.map((r) => ({
      surveyId: r.surveyId,
      jobType: r.jobType,
      submittedAt: r.submittedAt,
    })),
    mockInterviews: mockInterviewRows.map((r) => ({
      id: r.id,
      patternCode: r.patternCode,
      startedAt: r.startedAt,
      endedAt: r.endedAt ?? null,
      turnCount: r.turnCount,
    })),
  };
}

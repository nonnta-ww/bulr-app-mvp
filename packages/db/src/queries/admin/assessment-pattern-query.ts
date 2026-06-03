import { asc, eq } from 'drizzle-orm';

import { db } from '../../client';
import { assessmentPattern } from '../../schema/assessment-pattern';
import type { PatternCategory } from '../../schema/assessment-pattern';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export interface AssessmentPatternListItem {
  id: string;
  code: string;
  category: PatternCategory;
  title: string;
  isActive: boolean;
}

export interface AssessmentPatternDetail {
  id: string;
  code: string;
  category: PatternCategory;
  title: string;
  description: string;
  expectedScopeMin: number;
  expectedScopeMax: number;
  level1Intro: string;
  level2Focus: string;
  level3Focus: string;
  level4Focus: string;
  signals: string[];
  aiPerspective: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// getAssessmentPatternsForAdmin
// ---------------------------------------------------------------------------

/**
 * 管理者向けアセスメントパターン一覧クエリ。
 *
 * assessment_pattern テーブルの全件を code 昇順で返す。
 * 返却フィールド: id・code・category・title・isActive
 *
 * 下流タスク 5.2（index.ts re-export）・13.1（一覧ページ）が消費する。
 * READ-ONLY: CREATE/UPDATE/DELETE は Out of Boundary（Wave 5 以降）。
 */
export async function getAssessmentPatternsForAdmin(): Promise<AssessmentPatternListItem[]> {
  const rows = await db
    .select({
      id: assessmentPattern.id,
      code: assessmentPattern.code,
      category: assessmentPattern.category,
      title: assessmentPattern.title,
      isActive: assessmentPattern.is_active,
    })
    .from(assessmentPattern)
    .orderBy(asc(assessmentPattern.code));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    category: row.category,
    title: row.title,
    isActive: row.isActive,
  }));
}

// ---------------------------------------------------------------------------
// getAssessmentPatternDetail
// ---------------------------------------------------------------------------

/**
 * アセスメントパターン詳細クエリ。指定 code のパターン 1 件の全フィールドを返す。
 * 存在しない場合は undefined を返す。
 *
 * 下流タスク 13.2（詳細ページ）が消費する。
 * READ-ONLY: CREATE/UPDATE/DELETE は Out of Boundary（Wave 5 以降）。
 */
export async function getAssessmentPatternDetail(
  code: string,
): Promise<AssessmentPatternDetail | undefined> {
  const rows = await db
    .select({
      id: assessmentPattern.id,
      code: assessmentPattern.code,
      category: assessmentPattern.category,
      title: assessmentPattern.title,
      description: assessmentPattern.description,
      expectedScopeMin: assessmentPattern.expected_scope_min,
      expectedScopeMax: assessmentPattern.expected_scope_max,
      level1Intro: assessmentPattern.level_1_intro,
      level2Focus: assessmentPattern.level_2_focus,
      level3Focus: assessmentPattern.level_3_focus,
      level4Focus: assessmentPattern.level_4_focus,
      signals: assessmentPattern.signals,
      aiPerspective: assessmentPattern.ai_perspective,
      isActive: assessmentPattern.is_active,
      createdAt: assessmentPattern.created_at,
      updatedAt: assessmentPattern.updated_at,
    })
    .from(assessmentPattern)
    .where(eq(assessmentPattern.code, code))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    code: row.code,
    category: row.category,
    title: row.title,
    description: row.description,
    expectedScopeMin: row.expectedScopeMin,
    expectedScopeMax: row.expectedScopeMax,
    level1Intro: row.level1Intro,
    level2Focus: row.level2Focus,
    level3Focus: row.level3Focus,
    level4Focus: row.level4Focus,
    signals: row.signals,
    aiPerspective: row.aiPerspective,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

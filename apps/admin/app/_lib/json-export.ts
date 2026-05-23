/**
 * JSON エクスポート純関数
 *
 * Requirements: 8.10, 8.15
 * Boundary: JsonExport
 */

import type { LlmEvaluation, ManualEvaluation } from '@bulr/types/evaluation';
import type { SessionDetail } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export type SessionExportJson = {
  session: {
    id: string;
    status: string;
    started_at: string; // ISO 8601
    completed_at: string | null;
    planned_pattern_codes: string[];
    consent_obtained_at: string | null;
    consent_version: string | null;
  };
  candidate: {
    name: string;
    applied_role: string;
    background_summary: string;
    email?: string;
  };
  interviewer: {
    email: string;
    display_name: string;
    role_in_org: string | null;
  };
  coverages: Array<{
    pattern_code: string;
    pattern_category: string;
    level_reached: number;
    stuck_type: string | null;
    llm_evaluation: LlmEvaluation;
    manual_evaluation: ManualEvaluation | null;
  }>;
};

// ---------------------------------------------------------------------------
// ヘルパー: Date | string → ISO 文字列
// ---------------------------------------------------------------------------

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIso(value);
}

// ---------------------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------------------

/**
 * `SessionDetail` から JSON エクスポート用オブジェクトを生成する（純関数）。
 *
 * - snake_case キー（CSV フォーマットおよび外部コンシューマーとの互換性）
 * - manualEvaluation が null の場合、manual_evaluation は null
 * - 採用推奨フィールドなし
 */
export function buildJsonFromSession(detail: SessionDetail): SessionExportJson {
  const { session, candidate, interviewer, coverages } = detail;

  return {
    session: {
      id: session.id,
      status: session.status,
      started_at: toIso(session.started_at ?? session.created_at),
      completed_at: toIsoOrNull(session.completed_at),
      planned_pattern_codes: session.planned_pattern_codes,
      consent_obtained_at: toIsoOrNull(session.consent_obtained_at),
      consent_version: session.consent_version ?? null,
    },
    candidate: {
      name: candidate.name,
      applied_role: candidate.applied_role,
      background_summary: candidate.background_summary,
      ...(candidate.email !== null && candidate.email !== undefined
        ? { email: candidate.email }
        : {}),
    },
    interviewer: {
      email: interviewer.email,
      display_name: interviewer.displayName,
      role_in_org: interviewer.roleInOrg,
    },
    coverages: coverages.map((cov) => ({
      pattern_code: cov.pattern.code,
      pattern_category: cov.pattern.category,
      level_reached: cov.levelReached,
      stuck_type: cov.stuckType,
      llm_evaluation: cov.llmEvaluation,
      manual_evaluation: cov.manualEvaluation,
    })),
  };
}

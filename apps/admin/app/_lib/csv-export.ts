/**
 * CSV エクスポート純関数
 *
 * Requirements: 8.5-8.9, 8.16, 8.17, 13.5
 * Boundary: CsvExport
 */

import type { SessionDetail } from '@bulr/db/queries/admin';

// ---------------------------------------------------------------------------
// RFC 4180 準拠フィールドエスケープ
// ---------------------------------------------------------------------------

/**
 * CSV フィールド値を RFC 4180 に従いエスケープする。
 *
 * - null / undefined → 空文字列 `""`（引用符なし）
 * - number → toString()
 * - string: `,` `"` `\n` `\r` を含む場合 → ダブルクォートで囲み、内部の `"` を `""` にエスケープ
 *           それ以外 → そのまま返す
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  // string
  if (/[,"\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ---------------------------------------------------------------------------
// CSV ビルダー
// ---------------------------------------------------------------------------

const HEADER = [
  'session_id',
  'candidate_name',
  'candidate_applied_role',
  'interviewer_email',
  'pattern_code',
  'pattern_category',
  'level_reached',
  'stuck_type',
  'llm_authenticity',
  'llm_judgment',
  'llm_scope',
  'llm_meta_cognition',
  'llm_ai_literacy',
  'llm_notes',
  'llm_evaluated_at',
  'manual_authenticity',
  'manual_judgment',
  'manual_scope',
  'manual_meta_cognition',
  'manual_ai_literacy',
  'manual_notes',
  'reviewer',
  'reviewed_at',
] as const;

/**
 * `SessionDetail` から UTF-8 BOM 付き CRLF 区切り CSV 文字列を生成する。
 *
 * - 1行目: ヘッダー行（23列）
 * - 2行目以降: coverage ごとに 1 行
 * - manualEvaluation が null の場合、manual_* 列はすべて空文字
 * - 採用推奨列はなし
 */
export function buildCsvFromCoverages(detail: SessionDetail): string {
  const { session, candidate, interviewer, coverages } = detail;

  const headerRow = HEADER.join(',');

  const dataRows = coverages.map((cov) => {
    const pattern = cov.pattern;
    const llm = cov.llmEvaluation;
    const manual = cov.manualEvaluation;

    const fields: Array<string | number | null | undefined> = [
      // session / candidate / interviewer
      session.id,
      candidate.name,
      candidate.applied_role,
      interviewer.email,
      // pattern
      pattern.code,
      pattern.category,
      // coverage
      cov.levelReached,
      cov.stuckType,
      // llm evaluation
      llm.authenticity,
      llm.judgment,
      llm.scope,
      llm.meta_cognition,
      llm.ai_literacy,
      llm.notes,
      llm.evaluated_at,
      // manual evaluation (null → empty)
      manual !== null && manual !== undefined ? manual.authenticity : null,
      manual !== null && manual !== undefined ? manual.judgment : null,
      manual !== null && manual !== undefined ? manual.scope : null,
      manual !== null && manual !== undefined ? manual.meta_cognition : null,
      manual !== null && manual !== undefined ? manual.ai_literacy : null,
      manual !== null && manual !== undefined ? manual.notes : null,
      manual !== null && manual !== undefined ? manual.reviewer : null,
      manual !== null && manual !== undefined ? manual.reviewed_at : null,
    ];

    return fields.map(escapeCsvField).join(',');
  });

  const lines = [headerRow, ...dataRows];

  // UTF-8 BOM + CRLF 区切り
  return '﻿' + lines.join('\r\n');
}

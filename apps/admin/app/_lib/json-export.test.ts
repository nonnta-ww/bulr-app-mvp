/**
 * json-export.ts の純関数ユニットテスト
 *
 * interview-consent-gate spec（task 3.3）: migration 0023 で
 * consent_obtained_at が nullable 化されたことに対する null 安全性確認。
 *
 * Requirements: 5.1
 * Boundary: admin json-export
 */

import { describe, it, expect } from 'vitest';

import type { SessionDetail } from '@bulr/db/queries/admin';

import { buildJsonFromSession } from './json-export';

// ---------------------------------------------------------------------------
// フィクスチャ
// ---------------------------------------------------------------------------

/**
 * SessionDetail のベースフィクスチャ。consent_obtained_at はデフォルトで null
 * （interview-consent-gate 導入後の未同意セッションを模す）。
 */
function buildSessionDetail(
  overrides: Partial<SessionDetail['session']> = {},
): SessionDetail {
  return {
    session: {
      id: 'session_1',
      interviewer_id: 'user_1',
      candidate_id: 'candidate_1',
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: ['P01', 'P02'],
      consent_obtained_at: null,
      consent_version: 'ja-v1',
      consent_method: null,
      consent_actor_id: null,
      started_at: new Date('2026-07-01T10:00:00.000Z'),
      completed_at: null,
      created_at: new Date('2026-07-01T09:55:00.000Z'),
      updated_at: new Date('2026-07-01T10:00:00.000Z'),
      entry_id: null,
      capture_provider: null,
      capture_status: 'idle',
      bot_id: null,
      meeting_url: null,
      last_capture_event_at: null,
      analysis_capped_at: null,
      ...overrides,
    },
    candidate: {
      id: 'candidate_1',
      name: '山田太郎',
      applied_role: 'backend',
      background_summary: '5年間のバックエンド開発経験',
      email: 'yamada@example.com',
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      updated_at: new Date('2026-06-01T00:00:00.000Z'),
    },
    interviewer: {
      email: 'interviewer@example.com',
      displayName: '面接官 花子',
      roleInOrg: 'engineering_manager',
    },
    turns: [],
    coverages: [],
  };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('buildJsonFromSession', () => {
  it('consent_obtained_at が null のセッションでもエラーなく直列化される', () => {
    const detail = buildSessionDetail({ consent_obtained_at: null });

    expect(() => buildJsonFromSession(detail)).not.toThrow();
    const json = buildJsonFromSession(detail);
    expect(json.session.consent_obtained_at).toBeNull();
  });

  it('consent_obtained_at が Date のセッションでは ISO 8601 文字列に変換される', () => {
    const detail = buildSessionDetail({
      consent_obtained_at: new Date('2026-07-01T09:58:00.000Z'),
    });

    const json = buildJsonFromSession(detail);
    expect(json.session.consent_obtained_at).toBe('2026-07-01T09:58:00.000Z');
  });

  it('consent_version は常に非 null 文字列として出力される', () => {
    const detail = buildSessionDetail({ consent_obtained_at: null });

    const json = buildJsonFromSession(detail);
    expect(json.session.consent_version).toBe('ja-v1');
  });
});

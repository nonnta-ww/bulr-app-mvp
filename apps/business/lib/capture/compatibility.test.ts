/**
 * compatibility.test.ts — 新旧セッションの管理画面互換性検証 (task 8.2)
 *
 * 検証観点:
 * (1) 旧方式セッション: sessionDetailQuery が非 null を返し、ターン・カバレッジが正常
 * (2) 新方式セッション: sessionDetailQuery が非 null を返し、capture 形状のターンとカバレッジが正常
 * (3) CSV/JSON エクスポート用フィールド: SessionDetail が全フィールドを含む
 * (4) LLM 評価形状: 5 次元スコアが既存形状のまま、manual_evaluation は null 許容
 * (5) 同意記録: 新方式セッションに consent_obtained_at / consent_version が保持される
 * (6) アクセス制御: interviewer_id が設定されており所有者確認の構造的基盤が存在する
 *
 * Requirements: 6.2, 6.4, 7.1, 7.5
 * Design: "Data Contracts & Integration"（interview_turn.transcript JSON 不変）,
 *         "Boundary Commitments"（Revalidation Triggers）
 *
 * 注: admin エクスポーター（buildCsvFromCoverages / buildJsonFromSession）は
 *     apps/admin に属するため直接インポートしない。
 *     SessionDetail 契約のフィールドを直接検証する（app 境界を超えない）。
 *     アクセス制御の per-route 詳細テストは
 *       - live-state:
 *           apps/business/app/api/interview/sessions/[sessionId]/live-state/route.test.ts
 *           → "auth ガード（Req 7.1）" describe ブロックの (b)(c) テスト
 *       - start-capture / stop-capture:
 *           apps/business/app/(interviewer)/interviews/[sessionId]/_actions/capture-actions.test.ts
 *           → requireSessionOwnership による FORBIDDEN 判定
 *       - webhook 署名/トークン検証:
 *           apps/business/lib/capture/recall-webhook-verify.test.ts
 */

// @bulr/db は server-only を使用しないため vi.mock 不要。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, sessionDetailQuery } from '@bulr/db';
import type { LlmAnalysis, LlmEvaluation, HeatmapData } from '@bulr/types/evaluation';

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/**
 * pattern_coverage.llm_evaluation の共通モック値（5 次元スコア＋メタ情報）。
 * csv-export / json-export が参照するすべての列を網羅する。
 */
const MOCK_LLM_EVALUATION: LlmEvaluation = {
  authenticity: 2,
  judgment: 2,
  scope: 3,
  meta_cognition: 1,
  ai_literacy: 1,
  level_reached: 3,
  stuck_type: null,
  notes: '互換検証用テスト評価',
  evaluated_at: new Date('2026-01-01T10:40:00Z').toISOString(),
};

/**
 * interview_turn.llm_analysis の共通モック値。
 * matched_pattern_id は null（本テストでは pattern FK は pattern_id カラムで設定）。
 */
const MOCK_LLM_ANALYSIS: LlmAnalysis = {
  signals: {
    authenticity: 'observed',
    judgment: 'observed',
    meta_cognition: 'partial',
    ai_literacy: 'absent',
  },
  scope_signal: 3,
  level_reached_estimate: 3,
  pattern_match_confidence: 'exact',
  matched_pattern_id: null,
  stuck_signal: null,
  notes: '互換検証用テスト分析',
};

// ---------------------------------------------------------------------------
// テスト用共有状態（beforeAll で初期化、afterAll でクリーンアップ）
// ---------------------------------------------------------------------------

let userId: string;
let testPatternId: string;
let testPatternCode: string;
let candidateId: string;
let newSessionId: string;
let oldSessionId: string;

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('互換検証 — 新旧セッションの管理画面互換性 (task 8.2)', () => {
  // =========================================================================
  // beforeAll: 新方式 / 旧方式 セッションのシードデータを投入
  // =========================================================================

  beforeAll(async () => {
    if (!process.env['DATABASE_URL']) return;

    userId = crypto.randomUUID();
    testPatternId = crypto.randomUUID();
    testPatternCode = `COMPAT-${testPatternId.slice(0, 8)}`;
    candidateId = crypto.randomUUID();
    newSessionId = crypto.randomUUID();
    oldSessionId = crypto.randomUUID();


    // ------------------------------------------------------------------
    // 共有リソース
    // ------------------------------------------------------------------

    // user（面接官）
    await db.insert(schema.user).values({
      id: userId,
      email: `compat-test-${userId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // assessment_pattern（coverage の FK 対象）
    await db.insert(schema.assessmentPattern).values({
      id: testPatternId,
      code: testPatternCode,
      category: 'design',
      title: '互換検証用テストパターン',
      description: '互換検証用テストパターンの説明',
      expected_scope_min: 2,
      expected_scope_max: 4,
      level_1_intro: 'Level 1 説明',
      level_2_focus: 'Level 2 焦点',
      level_3_focus: 'Level 3 焦点',
      level_4_focus: 'Level 4 焦点',
      signals: ['シグナル1', 'シグナル2'],
      ai_perspective: 'AI 観点',
    });

    // candidate
    await db.insert(schema.candidate).values({
      id: candidateId,
      name: '互換検証 太郎',
      applied_role: 'バックエンドエンジニア',
      background_summary: '互換検証用テスト候補者のバックグラウンド',
    });

    // ==================================================================
    // 新方式セッション（capture_provider='recall', capture_status='stopped'）
    // ==================================================================

    await db.insert(schema.interviewSession).values({
      id: newSessionId,
      interviewer_id: userId,
      candidate_id: candidateId,
      status: 'completed',
      role: 'backend',
      planned_pattern_codes: [testPatternCode],
      consent_obtained_at: new Date('2026-01-01T10:00:00Z'),
      consent_version: 'ja-v1',
      started_at: new Date('2026-01-01T10:00:00Z'),
      completed_at: new Date('2026-01-01T10:40:00Z'),
      // capture columns（新方式: Recall ボット経由）
      capture_provider: 'recall',
      capture_status: 'stopped',
      bot_id: `bot-compat-${newSessionId.slice(0, 8)}`,
      meeting_url: 'https://zoom.us/j/123456789',
    });

    // transcript_segment（新方式: bot_realtime 由来、2 セグメント）
    await db.insert(schema.transcriptSegment).values([
      {
        session_id: newSessionId,
        seq: 1,
        source_id: `${newSessionId}:0.0`,
        speaker_role: 'interviewer',
        speaker_label: '面接官 一郎',
        text: '分散システム設計において最も重要視していることを教えてください。',
        started_at_ms: 0,
        ended_at_ms: 5000,
        origin: 'bot_realtime',
      },
      {
        session_id: newSessionId,
        seq: 2,
        source_id: `${newSessionId}:6.0`,
        speaker_role: 'candidate',
        speaker_label: '候補者 花子',
        text: '一貫性とパフォーマンスのトレードオフを意識しています。CAP定理に基づいて設計します。',
        started_at_ms: 6000,
        ended_at_ms: 25000,
        origin: 'bot_realtime',
      },
    ]);

    // interview_turn（新方式 CAPTURE 形状: audio_key=null, turn_fingerprint 設定）
    await db.insert(schema.interviewTurn).values({
      session_id: newSessionId,
      sequence_no: 1,
      pattern_id: testPatternId,
      question_source: 'llm_candidate_1',
      question_text: '分散システム設計において最も重要視していることを教えてください。',
      audio_key: null,         // 新方式: 音声は capture_recording が保持（audio_key=null）
      transcript: {
        interviewer: '分散システム設計において最も重要視していることを教えてください。',
        candidate: '一貫性とパフォーマンスのトレードオフを意識しています。CAP定理に基づいて設計します。',
        raw: '面接官: 分散システム設計において最も重要視していることを教えてください。\n候補者: 一貫性とパフォーマンスのトレードオフを意識しています。CAP定理に基づいて設計します。',
      },
      llm_analysis: MOCK_LLM_ANALYSIS,
      pattern_match_confidence: 'exact',
      duration_ms: 25000,
      turn_fingerprint: `fp-${newSessionId.slice(0, 8)}-1`, // 新方式: 冪等キー設定
    });

    // question_proposal（新方式: 3 候補）
    await db.insert(schema.questionProposal).values({
      session_id: newSessionId,
      prepared_for_turn_no: 2,
      candidate_1_text: '具体的な実装事例を教えていただけますか？',
      candidate_1_intent: 'deep_dive',
      candidate_2_text: '他のアプローチも検討しましたか？',
      candidate_2_intent: 'meta_cognition',
      candidate_3_text: '次のパターン: データモデリングについても聞かせてください。',
      candidate_3_intent: 'next_pattern',
      selected_index: null,
    });

    // pattern_coverage（新方式: llm_evaluation = 5 次元形状, manual_evaluation = null）
    await db.insert(schema.patternCoverage).values({
      session_id: newSessionId,
      pattern_id: testPatternId,
      level_reached: 3,
      stuck_type: null,
      llm_evaluation: MOCK_LLM_EVALUATION,
      manual_evaluation: null,
      turn_ids: [],
      finalized_at: new Date('2026-01-01T10:40:00Z'),
    });

    // session_report（新方式）
    await db.insert(schema.sessionReport).values({
      session_id: newSessionId,
      heatmap_data: {} as unknown as HeatmapData, // JSONB: 形状検証は session_report spec が担う
      summary_text: '互換検証用テストレポート（新方式）',
    });

    // ==================================================================
    // 旧方式セッション（capture 列なし: capture_status='idle' デフォルト）
    // ==================================================================

    await db.insert(schema.interviewSession).values({
      id: oldSessionId,
      interviewer_id: userId,
      candidate_id: candidateId,
      status: 'completed',
      role: 'backend',
      planned_pattern_codes: [testPatternCode],
      consent_obtained_at: new Date('2025-10-01T10:00:00Z'),
      consent_version: 'ja-v1',
      started_at: new Date('2025-10-01T10:00:00Z'),
      completed_at: new Date('2025-10-01T10:40:00Z'),
      // capture columns: 旧方式 → 未設定（capture_provider=null, capture_status='idle' デフォルト）
    });

    // interview_turn（旧方式 LEGACY 形状: audio_key 設定, turn_fingerprint=null）
    await db.insert(schema.interviewTurn).values({
      session_id: oldSessionId,
      sequence_no: 1,
      pattern_id: testPatternId,
      question_source: 'manual',
      question_text: '旧方式テスト質問テキスト',
      audio_key: 'audio/legacy-compat-test.webm',   // 旧方式: 音声キー設定
      audio_expires_at: new Date('2025-11-01T10:00:00Z'),
      transcript: {
        interviewer: '旧方式テスト質問テキスト',
        candidate: '旧方式テスト回答テキスト。システム設計の経験について詳しく説明します。',
        raw: '面接官: 旧方式テスト質問テキスト\n候補者: 旧方式テスト回答テキスト。システム設計の経験について詳しく説明します。',
      },
      llm_analysis: MOCK_LLM_ANALYSIS,
      pattern_match_confidence: 'exact',
      duration_ms: 30000,
      turn_fingerprint: null, // 旧方式: turn_fingerprint なし
    });

    // pattern_coverage（旧方式）
    await db.insert(schema.patternCoverage).values({
      session_id: oldSessionId,
      pattern_id: testPatternId,
      level_reached: 2,
      stuck_type: 'shallow',
      llm_evaluation: MOCK_LLM_EVALUATION,
      manual_evaluation: null,
      turn_ids: [],
      finalized_at: new Date('2025-10-01T10:40:00Z'),
    });

    // session_report（旧方式）
    await db.insert(schema.sessionReport).values({
      session_id: oldSessionId,
      heatmap_data: {} as unknown as HeatmapData,
      summary_text: '互換検証用テストレポート（旧方式）',
    });
  });

  // =========================================================================
  // afterAll: FK 制約に従い子テーブルから先に削除
  // =========================================================================

  afterAll(async () => {
    if (!process.env['DATABASE_URL']) return;

    for (const sid of [newSessionId, oldSessionId]) {
      if (!sid) continue;
      // transcript_segment（logical_turn_id FK が interview_turn を参照）
      await db.delete(schema.transcriptSegment).where(
        eq(schema.transcriptSegment.session_id, sid),
      );
      // session_report（session_id FK）
      await db.delete(schema.sessionReport).where(
        eq(schema.sessionReport.session_id, sid),
      );
      // pattern_coverage（session_id FK + pattern_id FK）
      await db.delete(schema.patternCoverage).where(
        eq(schema.patternCoverage.session_id, sid),
      );
      // interview_turn（session_id FK + pattern_id FK）
      await db.delete(schema.interviewTurn).where(
        eq(schema.interviewTurn.session_id, sid),
      );
      // question_proposal（session_id FK）
      await db.delete(schema.questionProposal).where(
        eq(schema.questionProposal.session_id, sid),
      );
      // interview_session（interviewer_id FK + candidate_id FK）
      await db.delete(schema.interviewSession).where(
        eq(schema.interviewSession.id, sid),
      );
    }
    if (candidateId) {
      await db.delete(schema.candidate).where(eq(schema.candidate.id, candidateId));
    }
    if (testPatternId) {
      await db.delete(schema.assessmentPattern).where(
        eq(schema.assessmentPattern.id, testPatternId),
      );
    }
    if (userId) {
      await db.delete(schema.user).where(eq(schema.user.id, userId));
    }
  });

  // =========================================================================
  // アサーション 1: 旧方式・新方式の回答全文確認（要件 6.2, 6.4）
  //
  // sessionDetailQuery が両方式でセッション詳細（ターン・カバレッジ）を返すことを検証する。
  // =========================================================================

  describe('アサーション 1: 旧方式・新方式の回答全文確認（要件 6.2, 6.4）', () => {
    it(
      '[新方式] sessionDetailQuery が非 null を返す',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
      },
    );

    it(
      '[旧方式] sessionDetailQuery が非 null を返す（旧データが引き続き閲覧可能 — 要件 6.2）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(oldSessionId);
        expect(detail).not.toBeNull();
      },
    );

    it(
      '[新方式] turns が 1 件以上あり transcript {interviewer, candidate, raw} 形状を持つ',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.turns.length).toBeGreaterThanOrEqual(1);

        const turn = detail!.turns[0]!;
        const transcript = turn.transcript as {
          interviewer: string;
          candidate: string;
          raw: string;
        };

        // 既存スキーマ形状: {interviewer, candidate, raw}（Req 4.4 / design "Data Contracts"）
        expect(typeof transcript.interviewer).toBe('string');
        expect(typeof transcript.candidate).toBe('string');
        expect(typeof transcript.raw).toBe('string');
        // transcript.candidate に回答テキストが含まれる
        expect(transcript.candidate).toContain('一貫性');

        // question_source が既存 enum の有効値である
        const validQuestionSources = [
          'llm_candidate_1',
          'llm_candidate_2',
          'llm_candidate_3',
          'manual',
        ];
        expect(validQuestionSources).toContain(turn.question_source);
        expect(turn.question_source).toBe('llm_candidate_1');
      },
    );

    it(
      '[旧方式] turns が 1 件以上あり transcript {interviewer, candidate, raw} 形状を持つ',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(oldSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.turns.length).toBeGreaterThanOrEqual(1);

        const turn = detail!.turns[0]!;
        const transcript = turn.transcript as {
          interviewer: string;
          candidate: string;
          raw: string;
        };
        // transcript 形状は旧方式でも変わらない
        expect(typeof transcript.interviewer).toBe('string');
        expect(typeof transcript.candidate).toBe('string');
        expect(typeof transcript.raw).toBe('string');
        expect(transcript.candidate).toContain('旧方式テスト回答');
      },
    );

    it(
      '[新方式] coverages が 1 件以上あり assessment_pattern と結合している',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.coverages.length).toBeGreaterThanOrEqual(1);

        const cov = detail!.coverages[0]!;
        expect(cov.pattern.code).toBe(testPatternCode);
        expect(cov.pattern.category).toBe('design');
      },
    );

    it(
      '[旧方式] coverages が 1 件以上あり assessment_pattern と結合している',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(oldSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.coverages.length).toBeGreaterThanOrEqual(1);
        expect(detail!.coverages[0]!.pattern.code).toBe(testPatternCode);
        // stuckType（csv-export.ts が列として出力）— 旧方式の seed 値が無変更で返る
        expect(detail!.coverages[0]!.stuckType).toBe('shallow');
      },
    );

    it(
      '[新方式] capture 特有: audio_key=null かつ turn_fingerprint が設定されている（Req 4.4）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        const turn = detail!.turns[0]!;
        // 新方式: 音声は capture_recording が保持し、interview_turn.audio_key は null
        expect(turn.audio_key).toBeNull();
        // 新方式: 冪等キー（turn_fingerprint）が設定されている
        expect(turn.turn_fingerprint).not.toBeNull();
        expect(typeof turn.turn_fingerprint).toBe('string');
      },
    );

    it(
      '[旧方式] レガシー特有: audio_key が設定されており turn_fingerprint=null',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(oldSessionId);
        expect(detail).not.toBeNull();
        const turn = detail!.turns[0]!;
        // 旧方式: 音声キーが直接ターンに紐付く
        expect(turn.audio_key).toBeTruthy();
        // 旧方式: turn_fingerprint なし
        expect(turn.turn_fingerprint).toBeNull();
      },
    );
  });

  // =========================================================================
  // アサーション 2: CSV/JSON エクスポート用フィールド（要件 6.4）
  //
  // apps/admin/app/_lib/csv-export.ts と json-export.ts が SessionDetail から
  // 参照するフィールドをすべて検証する。
  // app 境界を越えないよう admin エクスポーター関数は直接インポートしない。
  // =========================================================================

  describe('アサーション 2: CSV/JSON エクスポート用フィールド（要件 6.4）', () => {
    it(
      '[新方式] session / candidate / interviewer フィールドがすべて存在する',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();

        // session フィールド（json-export.ts が参照するもの）
        expect(detail!.session.id).toBe(newSessionId);
        expect(detail!.session.status).toBe('completed');
        expect(detail!.session.planned_pattern_codes).toEqual([testPatternCode]);
        // started_at（json-export: toIso(session.started_at ?? session.created_at)）
        expect(detail!.session.started_at ?? detail!.session.created_at).toBeTruthy();
        // consent フィールド（json-export + 要件 7.5）
        expect(detail!.session.consent_obtained_at).not.toBeNull();
        expect(detail!.session.consent_version).not.toBeNull();
        // completed_at（json-export: toIsoOrNull(session.completed_at)）— completed セッションでは非 null
        expect(detail!.session.completed_at).not.toBeNull();

        // candidate フィールド（csv-export / json-export 参照）
        expect(detail!.candidate.name).toBe('互換検証 太郎');
        expect(detail!.candidate.applied_role).toBe('バックエンドエンジニア');
        expect(typeof detail!.candidate.background_summary).toBe('string');

        // interviewer フィールド（csv-export: interviewer.email / json-export: display_name）
        expect(detail!.interviewer.email).toContain('@example.com');
        expect(typeof detail!.interviewer.displayName).toBe('string');
      },
    );

    it(
      '[新方式] coverages[0] の pattern / llmEvaluation フィールドがすべて存在する（csv-export 参照フィールド）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();

        const cov = detail!.coverages[0]!;

        // pattern フィールド（csv-export: pattern.code / pattern.category）
        expect(typeof cov.pattern.code).toBe('string');
        expect(typeof cov.pattern.category).toBe('string');

        // coverage フィールド（csv-export: levelReached / stuckType）
        expect(typeof cov.levelReached).toBe('number');
        // stuckType は null 許容（新方式でも既存スキーマ不変）

        // llmEvaluation 5 次元フィールド（csv-export が列として出力するもの）
        const llm = cov.llmEvaluation;
        expect(typeof llm.authenticity).toBe('number');
        expect(typeof llm.judgment).toBe('number');
        expect(typeof llm.scope).toBe('number');
        expect(typeof llm.meta_cognition).toBe('number');
        expect(typeof llm.ai_literacy).toBe('number');
        expect(typeof llm.notes).toBe('string');
        expect(typeof llm.evaluated_at).toBe('string');

        // manualEvaluation は null 許容（手動評価前の状態 → csv-export で空文字列出力）
        expect(cov.manualEvaluation).toBeNull();
      },
    );
  });

  // =========================================================================
  // アサーション 3: LLM 評価突合 / 手動評価形状（要件 6.4）
  //
  // pattern_coverage.llm_evaluation の 5 次元スコア形状が既存と同一であることを検証する。
  // manual_evaluation は null 許容（eval-comparison フォームで null を受け付ける）。
  // =========================================================================

  describe('アサーション 3: LLM 評価突合 / 手動評価形状（要件 6.4）', () => {
    it(
      '[新方式] pattern_coverage.llm_evaluation が 5 次元スコアの既存形状を持つ（DB ラウンドトリップ確認）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();

        const llm = detail!.coverages[0]!.llmEvaluation;

        // 5 次元スコア（number 型）— 既存スキーマ不変の構造的保証
        expect(typeof llm.authenticity).toBe('number');
        expect(typeof llm.judgment).toBe('number');
        expect(typeof llm.scope).toBe('number');
        expect(typeof llm.meta_cognition).toBe('number');
        expect(typeof llm.ai_literacy).toBe('number');
        // level_reached
        expect(typeof llm.level_reached).toBe('number');
        // evaluated_at（ISO 文字列）
        expect(typeof llm.evaluated_at).toBe('string');
        // stuck_type は null 許容（新方式でも変更なし）

        // DB ラウンドトリップ: 挿入値が正確に返る
        expect(llm.authenticity).toBe(MOCK_LLM_EVALUATION.authenticity);
        expect(llm.judgment).toBe(MOCK_LLM_EVALUATION.judgment);
        expect(llm.scope).toBe(MOCK_LLM_EVALUATION.scope);
        expect(llm.meta_cognition).toBe(MOCK_LLM_EVALUATION.meta_cognition);
        expect(llm.ai_literacy).toBe(MOCK_LLM_EVALUATION.ai_literacy);
      },
    );

    it(
      '[新方式] manual_evaluation は null（手動評価前の状態 — eval-comparison フォームで null 許容）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.coverages[0]!.manualEvaluation).toBeNull();
      },
    );
  });

  // =========================================================================
  // アサーション 4: 同意記録（要件 7.5）
  //
  // 新方式セッションに consent_obtained_at / consent_version が保持されることを確認する。
  // =========================================================================

  describe('アサーション 4: 同意記録（要件 7.5）', () => {
    it(
      '[新方式] session.consent_obtained_at が非 null（同意取得日時の保持）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.session.consent_obtained_at).not.toBeNull();
      },
    );

    it(
      '[新方式] session.consent_version が保持されている（同意文バージョンの保持）',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        expect(detail!.session.consent_version).toBe('ja-v1');
      },
    );
  });

  // =========================================================================
  // アサーション 5: アクセス制御の構造的基盤（要件 7.1）
  //
  // per-route のアクセス制限（403 返却）は既存テストが担う:
  //   - live-state エンドポイント（403 非所有者）:
  //       apps/business/app/api/interview/sessions/[sessionId]/live-state/route.test.ts
  //       → "auth ガード（Req 7.1）" describe の (b) 404・(c) 403 テスト
  //   - start-capture / stop-capture アクション（所有権チェック）:
  //       apps/business/app/(interviewer)/interviews/[sessionId]/_actions/capture-actions.test.ts
  //       → requireSessionOwnership の FORBIDDEN 判定
  //   - webhook 認証（署名/トークン検証）:
  //       apps/business/lib/capture/recall-webhook-verify.test.ts
  //       → 署名不正・トークン不正 → 401 判定
  //
  // ここでは新方式セッションが interviewer_id を保持することを DB レベルで確認する。
  // =========================================================================

  describe('アサーション 5: アクセス制御の構造的基盤（要件 7.1）', () => {
    it(
      '[新方式] session.interviewer_id が設定されており所有者確認の構造的基盤が存在する',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping');
          return;
        }
        const detail = await sessionDetailQuery(newSessionId);
        expect(detail).not.toBeNull();
        // 所有者 ID が一致（requireSessionOwnership はこの値を参照して 403 を返す）
        expect(detail!.session.interviewer_id).toBe(userId);
        // 面接官 email が取得できる（アクセス制御の主体識別）
        expect(detail!.interviewer.email).toContain('@example.com');
      },
    );
  });
});

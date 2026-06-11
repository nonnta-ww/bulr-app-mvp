/**
 * pipeline-integration.test.ts — ingestion → segmenter → pipeline 統合テスト (task 4.4)
 *
 * 検証観点:
 * (1) 実面接相当の系列: transcript.data 連続投入 → turn / proposal / coverage が既存スキーマ形状で生成
 * (2) 重複配信の冪等性: 同一 source_id を 2 回投入 → segment 1 件 / tick 2 回 → turn 1 件
 * (3) 順序逆転: out-of-order 投入 → started_at_ms ソートで正しい順序のターンが確定
 * (4) webhook + tick 同時起動: advisory lock + 一意制約で二重処理なし
 * (5) 解析上限 (Req 4.5): llm:sessionId >= 150 → turn なし / segment は永続化継続
 *
 * Requirements: 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5
 * Design: Testing Strategy Integration Tests #1, System Flows, TurnPipeline
 *
 * モック方針:
 * - @bulr/ai (createLlmContext) のみモック → LLM 呼び出しを決定論的に制御
 * - DB / webhook route / segmenter / turn-pipeline はすべて実コード
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。vitest Node 環境では空モックに置換。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const {
  mockAnalyzeTurn,
  mockSplitInterviewerCandidate,
  mockAggregatePatternCoverage,
  mockProposeNextQuestions,
} = vi.hoisted(() => ({
  mockAnalyzeTurn: vi.fn(),
  mockSplitInterviewerCandidate: vi.fn(),
  mockAggregatePatternCoverage: vi.fn(),
  mockProposeNextQuestions: vi.fn(),
}));

/**
 * @bulr/ai のモック。
 * createLlmContext は mock* 関数を束縛した決定論的コンテキストを返す。
 * 実際の Anthropic API は一切呼ばない。
 */
vi.mock('@bulr/ai', () => ({
  createLlmContext: vi.fn(() => ({
    analyzeTurn: mockAnalyzeTurn,
    splitInterviewerCandidate: mockSplitInterviewerCandidate,
    proposeNextQuestions: mockProposeNextQuestions,
    aggregatePatternCoverage: mockAggregatePatternCoverage,
    generateSessionReport: vi.fn().mockResolvedValue({ summary_text: '' }),
  })),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asc, count, eq, sql } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import type { LlmAnalysis, LlmEvaluation } from '@bulr/types/evaluation';
import { issueTranscriptToken } from './recall-webhook-verify';
import { runSegmenterTick } from './segmenter-tick';
import { createWriteBackConsumer } from './turn-pipeline';
import { POST } from '../../app/api/webhooks/recall/transcript/route';

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** 面接官の表示名（speaker_role 正規化で interviewer に分類される） */
const INTERVIEWER_NAME = '面接官 一郎';
/** 候補者の表示名（INTERVIEWER_NAME と異なるため candidate に分類される） */
const CANDIDATE_NAME = '候補者 花子';

// ---------------------------------------------------------------------------
// モック戻り値の定義（テスト間共通）
// ---------------------------------------------------------------------------

/**
 * pattern_coverage upsert をトリガーする LlmEvaluation（既存スキーマ形状）。
 * authenticity / judgment / scope / meta_cognition / ai_literacy: number (0-3)
 * level_reached: number (0-4)
 */
const MOCK_LLM_EVALUATION: LlmEvaluation = {
  authenticity: 2,
  judgment: 2,
  scope: 3,
  meta_cognition: 1,
  ai_literacy: 1,
  level_reached: 4,
  stuck_type: null,
  notes: '統合テスト用モック評価',
  evaluated_at: new Date().toISOString(),
};

/** proposeNextQuestions の戻り値（3 候補） */
const MOCK_PROPOSALS = {
  candidates: [
    { text: '次の質問候補1: 詳しく教えてください', intent: 'deep_dive' as const },
    { text: '次の質問候補2: 別の観点から', intent: 'next_pattern' as const },
    { text: '次の質問候補3: 振り返ってみて', intent: 'meta_cognition' as const },
  ],
};

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** 指定 token を付与したトランスクリプト webhook リクエストを構築する */
function makeRequest(body: unknown, token: string): Request {
  return new Request(
    `https://example.com/api/webhooks/recall/transcript?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/** transcript.data ペイロードを構築するヘルパー */
function makeTranscriptPayload(opts: {
  botId: string;
  participantName?: string | null;
  text?: string;
  startTime?: number;
  endTime?: number;
}): object {
  return {
    event: 'transcript.data',
    data: {
      bot_id: opts.botId,
      transcript: {
        text: opts.text ?? 'テスト発話テキスト',
        participant: {
          id: 'participant-1',
          name: opts.participantName ?? '参加者',
        },
        is_final: true,
        start_time: opts.startTime ?? 0.0,
        end_time: opts.endTime ?? 5.0,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('pipeline-integration — ingestion → segmenter → pipeline E2E', () => {
  let userId: string;
  let sessionId: string;
  let botId: string;
  let token: string;
  let testPatternId: string;
  let testPatternCode: string;

  // -------------------------------------------------------------------------
  // beforeEach: テストごとに独立したユーザー・セッション・パターンを作成
  // -------------------------------------------------------------------------

  beforeEach(async () => {
    // RECALL_WEBHOOK_SECRET を stub（トークン発行・検証に必要）
    vi.stubEnv('RECALL_WEBHOOK_SECRET', 'test-webhook-secret');

    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();
    botId = `bot-${crypto.randomUUID()}`;
    testPatternId = crypto.randomUUID();
    testPatternCode = `TEST-INT-${testPatternId.slice(0, 8)}`;
    token = issueTranscriptToken({ sessionId });

    // LLM モックを設定（testPatternId を使うため beforeEach で設定）
    const completionAnalysis: LlmAnalysis = {
      signals: {
        authenticity: 'observed',
        judgment: 'observed',
        meta_cognition: 'partial',
        ai_literacy: 'absent',
      },
      scope_signal: 4,
      level_reached_estimate: 4,
      pattern_match_confidence: 'exact',
      matched_pattern_id: testPatternId,
      stuck_signal: null,
      notes: '統合テスト用モック分析（完了シグナル）',
    };

    mockAnalyzeTurn.mockResolvedValue(completionAnalysis);
    mockSplitInterviewerCandidate.mockResolvedValue({
      interviewer_text: '分離後面接官テキスト',
      candidate_text: '分離後候補者テキスト',
    });
    mockAggregatePatternCoverage.mockResolvedValue(MOCK_LLM_EVALUATION);
    mockProposeNextQuestions.mockResolvedValue(MOCK_PROPOSALS);

    if (!process.env['DATABASE_URL']) return;

    // user（面接官）— INTERVIEWER_NAME と user.name を一致させて speaker_role=interviewer にする
    await db.insert(schema.user).values({
      id: userId,
      email: `int-test-${userId}@example.com`,
      emailVerified: false,
      name: INTERVIEWER_NAME,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // assessment_pattern（coverage 集約 / FK 対象）
    await db.insert(schema.assessmentPattern).values({
      id: testPatternId,
      code: testPatternCode,
      category: 'design',
      title: '統合テスト用パターン',
      description: '統合テスト用パターンの説明',
      expected_scope_min: 2,
      expected_scope_max: 4,
      level_1_intro: 'Level 1 説明',
      level_2_focus: 'Level 2 焦点',
      level_3_focus: 'Level 3 焦点',
      level_4_focus: 'Level 4 焦点',
      signals: ['シグナル1', 'シグナル2'],
      ai_perspective: 'AI 観点',
    });

    // interview_session（recording 状態）
    // started_at = epoch(0) にすることで start_time(秒) → started_at_ms(ms) が直接変換可能
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: userId,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [testPatternCode],
      capture_status: 'recording',
      bot_id: botId,
      started_at: new Date(0),
    });
  });

  // -------------------------------------------------------------------------
  // afterEach: FK 制約に従い子テーブルから先に削除
  // -------------------------------------------------------------------------

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (!process.env['DATABASE_URL']) return;

    // transcript_segment → interview_turn (logical_turn_id FK)
    await db.delete(schema.transcriptSegment).where(eq(schema.transcriptSegment.session_id, sessionId));
    // pattern_coverage → assessment_pattern (pattern_id FK)
    await db.delete(schema.patternCoverage).where(eq(schema.patternCoverage.session_id, sessionId));
    // interview_turn → assessment_pattern (pattern_id FK), question_proposal (proposal_id FK)
    await db.delete(schema.interviewTurn).where(eq(schema.interviewTurn.session_id, sessionId));
    // question_proposal → interview_session
    await db.delete(schema.questionProposal).where(eq(schema.questionProposal.session_id, sessionId));
    // interview_session → user
    await db.delete(schema.interviewSession).where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    // rate_limit（llm:<sessionId> キー）
    await db.execute(sql`DELETE FROM rate_limit WHERE key = ${'llm:' + sessionId}`);
    // assessment_pattern（子テーブルを全て削除後に削除）
    await db.delete(schema.assessmentPattern).where(eq(schema.assessmentPattern.id, testPatternId));
  });

  // =========================================================================
  // シナリオ 1: 実面接相当の系列投入
  //
  // Q1+A1+Q2+A2 を順次 POST → segmenter-tick で 2 論理ターンを確定。
  // 出力形状（transcript / audio_key / llm_analysis / pattern_coverage / question_proposal）が
  // 既存スキーマ契約と一致することを検証する（Req 4.4, 6.2）。
  //
  // Requirements: 3.2, 4.1, 4.2, 4.3, 4.4
  // =========================================================================

  describe('シナリオ 1: 実面接相当の系列投入', () => {
    it(
      'Q1+A1+Q2+A2 を POST → tick で 2 ターン確定、transcript {interviewer, candidate, raw} / audio_key=null / coverage / proposals が既存スキーマ形状で生成される',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        // ------------------------------------------------------------------
        // Q1: 面接官の質問 t=0–5s
        // ------------------------------------------------------------------
        const resQ1 = await POST(makeRequest(makeTranscriptPayload({
          botId,
          participantName: INTERVIEWER_NAME,
          text: '分散システム設計において、最も重要視していることを教えてください。',
          startTime: 0.0,
          endTime: 5.0,
        }), token));
        expect(resQ1.status).toBe(200);

        // ------------------------------------------------------------------
        // A1: 候補者の回答 t=6–25s
        //   テキスト > 40 字（minAnswerChars=40）
        //   A1.ended_at=25s、Q2.started_at=35s → gap=10000ms > silenceGap=4000ms → ターン 1 確定
        // ------------------------------------------------------------------
        const resA1 = await POST(makeRequest(makeTranscriptPayload({
          botId,
          participantName: CANDIDATE_NAME,
          text: 'はい、主に一貫性とパフォーマンスのトレードオフを意識しています。CAP定理に基づいてシステムの特性を整理し、ユースケースに応じて適切な設計を選択しています。',
          startTime: 6.0,
          endTime: 25.0,
        }), token));
        expect(resA1.status).toBe(200);

        // ------------------------------------------------------------------
        // Q2: 面接官の追加質問 t=35–40s（A1 との gap > silenceGap → ターン 1 が silence で確定）
        // ------------------------------------------------------------------
        const resQ2 = await POST(makeRequest(makeTranscriptPayload({
          botId,
          participantName: INTERVIEWER_NAME,
          text: '具体的な事例を教えていただけますか？',
          startTime: 35.0,
          endTime: 40.0,
        }), token));
        expect(resQ2.status).toBe(200);

        // ------------------------------------------------------------------
        // A2: 候補者の回答 t=41–60s（forceCloseTrailing=true で確定）
        // ------------------------------------------------------------------
        const resA2 = await POST(makeRequest(makeTranscriptPayload({
          botId,
          participantName: CANDIDATE_NAME,
          text: 'Kafkaを使ったメッセージキューイングシステムで、データの一貫性を保ちながら高スループットを実現しました。その設計と経験について詳しく説明します。',
          startTime: 41.0,
          endTime: 60.0,
        }), token));
        expect(resA2.status).toBe(200);

        // 4 セグメントが挿入されていること
        const [segCountRow] = await db
          .select({ c: count() })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(Number(segCountRow?.c)).toBe(4);

        // ------------------------------------------------------------------
        // tick を実行（now = 10s 先 → timeSinceActivity ≈ 10000ms > 4000ms）
        // ------------------------------------------------------------------
        const now = Date.now() + 10_000;
        await runSegmenterTick({
          sessionId,
          now,
          consumer: createWriteBackConsumer(sessionId),
        });

        // ------------------------------------------------------------------
        // interview_turn: 2 件
        // ------------------------------------------------------------------
        const turns = await db
          .select()
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId))
          .orderBy(asc(schema.interviewTurn.sequence_no));

        expect(turns).toHaveLength(2);

        // ターン 1 (Q1 + A1)
        const turn1 = turns[0]!;
        const t1 = turn1.transcript as { interviewer: string; candidate: string; raw: string };

        // transcript JSON 形状: {interviewer, candidate, raw} — 既存スキーマ契約 (Req 4.4, 6.2)
        expect(typeof t1.interviewer).toBe('string');
        expect(typeof t1.candidate).toBe('string');
        expect(typeof t1.raw).toBe('string');
        // Q1 テキストが interviewer に、A1 テキストが candidate に入っていること
        expect(t1.interviewer).toContain('分散システム');
        expect(t1.candidate).toContain('一貫性');
        // audio_key は null（音声は capture_recording が保持、Req 4.4）
        expect(turn1.audio_key).toBeNull();
        // llm_analysis が設定されていること（mocked の戻り値）
        const a1 = turn1.llm_analysis as LlmAnalysis;
        expect(a1.level_reached_estimate).toBe(4);
        expect(a1.pattern_match_confidence).toBe('exact');
        // turn_fingerprint（冪等キー）が存在すること
        expect(turn1.turn_fingerprint).toBeTruthy();
        expect(turn1.sequence_no).toBe(1);

        // ターン 2 (Q2 + A2)
        const turn2 = turns[1]!;
        const t2 = turn2.transcript as { interviewer: string; candidate: string; raw: string };
        expect(t2.interviewer).toContain('具体的な事例');
        expect(t2.candidate).toContain('Kafka');
        expect(turn2.audio_key).toBeNull();
        expect(turn2.sequence_no).toBe(2);

        // ------------------------------------------------------------------
        // pattern_coverage: 既存スキーマ形状（Req 4.3, 4.4）
        // level_reached_estimate=4 なので coverage が upsert されるはず
        // ------------------------------------------------------------------
        const coverageRows = await db
          .select()
          .from(schema.patternCoverage)
          .where(eq(schema.patternCoverage.session_id, sessionId));
        expect(coverageRows.length).toBeGreaterThanOrEqual(1);

        const cov = coverageRows[0]!;
        expect(cov.pattern_id).toBe(testPatternId);
        expect(cov.level_reached).toBe(MOCK_LLM_EVALUATION.level_reached); // 4

        // llm_evaluation 形状: 5 次元スコア + level_reached + stuck_type + evaluated_at
        const llmEval = cov.llm_evaluation as unknown as Record<string, unknown>;
        expect(typeof llmEval['authenticity']).toBe('number');
        expect(typeof llmEval['judgment']).toBe('number');
        expect(typeof llmEval['scope']).toBe('number');
        expect(typeof llmEval['level_reached']).toBe('number');
        expect(typeof llmEval['evaluated_at']).toBe('string');

        // ------------------------------------------------------------------
        // question_proposal: 3 候補、prepared_for_turn_no（Req 3.2, 3.4）
        // ------------------------------------------------------------------
        const proposals = await db
          .select()
          .from(schema.questionProposal)
          .where(eq(schema.questionProposal.session_id, sessionId))
          .orderBy(asc(schema.questionProposal.prepared_for_turn_no));
        expect(proposals.length).toBeGreaterThanOrEqual(1);

        const prop = proposals[0]!;
        // 3 候補がすべて存在すること
        expect(prop.candidate_1_text).toBe(MOCK_PROPOSALS.candidates[0]!.text);
        expect(prop.candidate_2_text).toBe(MOCK_PROPOSALS.candidates[1]!.text);
        expect(prop.candidate_3_text).toBe(MOCK_PROPOSALS.candidates[2]!.text);
        expect(prop.candidate_1_intent).toBe('deep_dive');
        expect(prop.candidate_2_intent).toBe('next_pattern');
        // prepared_for_turn_no = turn 1 の sequence_no + 1 = 2 以上
        expect(prop.prepared_for_turn_no).toBeGreaterThanOrEqual(2);

        // ------------------------------------------------------------------
        // 全セグメントが claim 済み（logical_turn_id 設定済み、Req 4.1）
        // ------------------------------------------------------------------
        const segs = await db
          .select({ logical_turn_id: schema.transcriptSegment.logical_turn_id })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(segs).toHaveLength(4);
        segs.forEach((s) => expect(s.logical_turn_id).not.toBeNull());
      },
    );
  });

  // =========================================================================
  // シナリオ 2: 重複配信の冪等性
  //
  // 同一 source_id の webhook を 2 回投入 → segment 1 件のまま。
  // tick を 2 回実行 → interview_turn 1 件のまま（二重処理なし）。
  //
  // Requirements: design.md "冪等性: (session_id, source_id) 一意制約"
  //               TurnPipeline "turn_fingerprint 一意制約"
  // =========================================================================

  describe('シナリオ 2: 重複配信の冪等性', () => {
    it('同一 source_id の webhook を 2 回 POST → transcript_segment は 1 件のまま', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const samePayload = makeTranscriptPayload({
        botId,
        participantName: INTERVIEWER_NAME,
        text: '重複テスト: システムの可用性についてどのようにアプローチしますか？',
        startTime: 100.0,
        endTime: 105.0,
      });

      // 1 回目
      const res1 = await POST(makeRequest(samePayload, token));
      expect(res1.status).toBe(200);
      // 2 回目（同一 start_time → 同一 source_id = `${botId}:100`）
      const res2 = await POST(makeRequest(samePayload, token));
      expect(res2.status).toBe(200);

      const [row] = await db
        .select({ c: count() })
        .from(schema.transcriptSegment)
        .where(eq(schema.transcriptSegment.session_id, sessionId));
      // HEADLINE: 重複投入でも 1 行のまま
      expect(Number(row?.c)).toBe(1);
    });

    it('Q+A 投入後に tick を 2 回実行 → interview_turn は 1 件のまま（二重処理なし）', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      // Q+A を POST（1 論理ターン分）
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: INTERVIEWER_NAME,
        text: '重複 tick テスト: スケーラビリティを確保するための戦略を教えてください。',
        startTime: 200.0,
        endTime: 205.0,
      }), token));
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: CANDIDATE_NAME,
        text: 'スケーラビリティのために水平スケーリング戦略を採用しています。ロードバランサーとオートスケーリングを組み合わせて対応しています。',
        startTime: 206.0,
        endTime: 220.0,
      }), token));

      const now = Date.now() + 10_000;
      const consumer = createWriteBackConsumer(sessionId);

      // tick を 2 回連続実行（1 回目が segment を claim → 2 回目は no-op）
      await runSegmenterTick({ sessionId, now, consumer });
      await runSegmenterTick({ sessionId, now, consumer });

      const [row] = await db
        .select({ c: count() })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));
      // HEADLINE: 2 回実行でも interview_turn は 1 件のまま
      expect(Number(row?.c)).toBe(1);
    });
  });

  // =========================================================================
  // シナリオ 3: 順序逆転（out-of-order 配信）
  //
  // セグメントを時系列から逆転した順番で POST しても、
  // segmenter が started_at_ms で昇順ソートして正しいターンを確定することを検証する。
  //
  // Requirements: design.md "順序逆転は started_at_ms ソートで吸収"
  // =========================================================================

  describe('シナリオ 3: 順序逆転（out-of-order 配信）', () => {
    it('A1 → Q2 → A2 → Q1 の順で POST → started_at_ms ソートで Q1+A1 / Q2+A2 の正しい順序が復元される', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      // 意図的に時系列を逆転した順で POST
      // A1（t=6–25s）を最初に投入
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: CANDIDATE_NAME,
        text: 'はい、一貫性とパフォーマンスのトレードオフを意識した設計を行っています。CAP定理に基づいて判断します。',
        startTime: 6.0,
        endTime: 25.0,
      }), token));

      // Q2（t=35–40s）を A2 より前に投入
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: INTERVIEWER_NAME,
        text: '具体的なケースを教えてください。',
        startTime: 35.0,
        endTime: 40.0,
      }), token));

      // A2（t=41–60s）を Q1 より前に投入
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: CANDIDATE_NAME,
        text: '具体的には Kafka を使ったシステムで高可用性を実現しました。その詳細を説明します。メッセージキューを活用した設計です。',
        startTime: 41.0,
        endTime: 60.0,
      }), token));

      // Q1（t=0–5s）を最後に投入（実際は最初の質問）
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: INTERVIEWER_NAME,
        text: '分散システム設計で重要にしていることを教えてください。',
        startTime: 0.0,
        endTime: 5.0,
      }), token));

      // tick（sorted by started_at_ms: Q1→A1→Q2→A2 の順に評価される）
      const now = Date.now() + 10_000;
      await runSegmenterTick({
        sessionId,
        now,
        consumer: createWriteBackConsumer(sessionId),
      });

      const turns = await db
        .select()
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId))
        .orderBy(asc(schema.interviewTurn.sequence_no));

      // 2 ターン生成
      expect(turns).toHaveLength(2);

      // ターン 1: Q1（started_at_ms=0）の発話が interviewer、A1（started_at_ms=6000）が candidate
      const t1 = turns[0]!.transcript as { interviewer: string; candidate: string; raw: string };
      expect(t1.interviewer).toContain('分散システム'); // Q1 text
      expect(t1.candidate).toContain('一貫性');          // A1 text

      // ターン 2: Q2（started_at_ms=35000）が interviewer、A2（started_at_ms=41000）が candidate
      const t2 = turns[1]!.transcript as { interviewer: string; candidate: string; raw: string };
      expect(t2.interviewer).toContain('具体的なケース'); // Q2 text
      expect(t2.candidate).toContain('Kafka');            // A2 text
    });
  });

  // =========================================================================
  // シナリオ 4: webhook + tick 同時起動（並行安全性）
  //
  // advisory lock（pg_advisory_xact_lock）と一意制約で
  // 二重処理が起きないことを検証する。
  //
  // Requirements: design.md "advisory lock + 一意制約で二重処理なし"
  // =========================================================================

  describe('シナリオ 4: webhook + tick 同時起動（並行安全性）', () => {
    it('tick を 2 本同時起動 → advisory lock で直列化、interview_turn は 1 件（二重処理なし）', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      // Q+A を POST してセグメントを準備
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: INTERVIEWER_NAME,
        text: '並行 tick テスト: アーキテクチャ選択の基準を教えてください。設計上の重要な観点は？',
        startTime: 300.0,
        endTime: 305.0,
      }), token));
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: CANDIDATE_NAME,
        text: 'アーキテクチャ選択ではスケーラビリティ・保守性・コストのバランスを重視しています。要件に応じてマイクロサービスかモノリスかを判断します。',
        startTime: 306.0,
        endTime: 320.0,
      }), token));

      const now = Date.now() + 10_000;
      const consumer = createWriteBackConsumer(sessionId);

      // 2 つの tick を同時に起動（advisory lock で直列化される）
      await Promise.all([
        runSegmenterTick({ sessionId, now, consumer }),
        runSegmenterTick({ sessionId, now, consumer }),
      ]);

      // HEADLINE: 二重処理なし → interview_turn は 1 件
      const [row] = await db
        .select({ c: count() })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));
      expect(Number(row?.c)).toBe(1);
    });

    it('重複 POST と tick を同時起動 → source_id 一意制約で segment 重複なし、turn 重複なし', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      // Q+A をまず順次 POST（セグメントを確立）
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: INTERVIEWER_NAME,
        text: '並行テスト2: 技術的な挑戦について教えてください。経験した最も難しい問題は何ですか？',
        startTime: 400.0,
        endTime: 405.0,
      }), token));
      await POST(makeRequest(makeTranscriptPayload({
        botId,
        participantName: CANDIDATE_NAME,
        text: '最も難しかった問題はマイクロサービス間のデータ整合性でした。分散トランザクションの実装で様々な課題を経験しました。',
        startTime: 406.0,
        endTime: 420.0,
      }), token));

      // A1 と同一内容（同一 source_id）の重複 POST ペイロード
      const duplicatePayload = makeTranscriptPayload({
        botId,
        participantName: CANDIDATE_NAME,
        text: '最も難しかった問題はマイクロサービス間のデータ整合性でした。分散トランザクションの実装で様々な課題を経験しました。',
        startTime: 406.0, // 同一 start_time → 同一 source_id
        endTime: 420.0,
      });

      const now = Date.now() + 10_000;
      const consumer = createWriteBackConsumer(sessionId);

      // 重複 POST と tick を同時に起動
      await Promise.all([
        POST(makeRequest(duplicatePayload, token)),
        runSegmenterTick({ sessionId, now, consumer }),
      ]);

      // source_id 一意制約: 元 2 件のみ（重複分は no-op）
      const [segRow] = await db
        .select({ c: count() })
        .from(schema.transcriptSegment)
        .where(eq(schema.transcriptSegment.session_id, sessionId));
      expect(Number(segRow?.c)).toBe(2);

      // turn 重複なし: 1 件のみ
      const [turnRow] = await db
        .select({ c: count() })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));
      expect(Number(turnRow?.c)).toBe(1);
    });
  });

  // =========================================================================
  // シナリオ 5: 解析上限到達（Req 4.5）
  //
  // llm:<sessionId> >= 150 の状態で Q+A を POST した後に tick を実行。
  // interview_turn は生成されないが、transcript_segment は永続化継続される。
  //
  // Requirements: 4.5
  // =========================================================================

  describe('シナリオ 5 (Req 4.5): 解析上限到達', () => {
    it(
      'llm:sessionId = 150 の状態で Q+A を POST → tick で interview_turn なし / segment は永続化継続 / analysis_capped_at 設定',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        // llm:<sessionId> を 150 に設定（上限到達状態）
        await db.execute(sql`
          INSERT INTO rate_limit (key, count, window_start)
          VALUES (${'llm:' + sessionId}, 150, now())
          ON CONFLICT (key) DO UPDATE SET count = 150, window_start = now()
        `);

        // Q+A を POST（segment は解析上限に関わらず挿入される）
        const resQ = await POST(makeRequest(makeTranscriptPayload({
          botId,
          participantName: INTERVIEWER_NAME,
          text: '上限テスト: パフォーマンスチューニングの経験について教えてください。',
          startTime: 500.0,
          endTime: 505.0,
        }), token));
        expect(resQ.status).toBe(200);

        const resA = await POST(makeRequest(makeTranscriptPayload({
          botId,
          participantName: CANDIDATE_NAME,
          text: 'パフォーマンスチューニングの経験として、DBクエリ最適化やキャッシュ戦略の実装を行いました。インデックス設計とクエリプランの分析が中心でした。',
          startTime: 506.0,
          endTime: 520.0,
        }), token));
        expect(resA.status).toBe(200);

        // HEADLINE: segment は永続化継続（2 件）
        const [segRow] = await db
          .select({ c: count() })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(Number(segRow?.c)).toBe(2);

        // tick を実行
        const now = Date.now() + 10_000;
        await runSegmenterTick({
          sessionId,
          now,
          consumer: createWriteBackConsumer(sessionId),
        });

        // HEADLINE: interview_turn は生成されない（解析停止）
        const [turnRow] = await db
          .select({ c: count() })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));
        expect(Number(turnRow?.c)).toBe(0);

        // analysis_capped_at が設定されていること（Req 4.5 の観測可能な完了）
        const [sessionRow] = await db
          .select({ analysis_capped_at: schema.interviewSession.analysis_capped_at })
          .from(schema.interviewSession)
          .where(eq(schema.interviewSession.id, sessionId));
        expect(sessionRow!.analysis_capped_at).not.toBeNull();

        // segment は claim されていない（turn が生成されなかったため logical_turn_id = null）
        const segs = await db
          .select({ logical_turn_id: schema.transcriptSegment.logical_turn_id })
          .from(schema.transcriptSegment)
          .where(eq(schema.transcriptSegment.session_id, sessionId));
        expect(segs).toHaveLength(2);
        segs.forEach((s) => expect(s.logical_turn_id).toBeNull());
      },
    );
  });
});

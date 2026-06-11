/**
 * TurnPipeline 統合テスト（DB バックド、LLM モック）
 *
 * task 4.2 — 論理ターンの書き戻し（claim + 冪等）の実装を検証する。
 *
 * テスト観点:
 * (1) Normal turn write-back: 通常ターン（Q+A）→ 1 interview_turn、transcript JSON 形状確認
 * (2) Unknown pending-split turn: unknown-only → splitInterviewerCandidate 呼び出し
 * (3) Idempotency — re-run: 同一ターンを 2 回処理 → 重複なし（1 行のまま）
 * (4) Idempotency — concurrent: 並行 runWithSessionLock → 重複なし（1 行のまま）
 * (5) Admin visibility (6.2/6.4): transcript JSON 形状が既存契約と一致する
 * (6) question_source: proposal 一致 → llm_candidate_N / 不一致または proposal なし → manual
 *
 * Requirements: 4.1, 4.4, 6.2, 6.4
 * Design: TurnPipeline (Responsibilities & Constraints), Testing Strategy Integration Tests #1
 */

// `server-only` は Next.js ビルド時専用の副作用パッケージ。vitest Node 環境では空モックに置換。
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// vi.hoisted: vi.mock ファクトリ内から参照できるよう先に評価する
// ---------------------------------------------------------------------------

const { mockAnalyzeTurn, mockSplitInterviewerCandidate } = vi.hoisted(() => ({
  mockAnalyzeTurn: vi.fn(),
  mockSplitInterviewerCandidate: vi.fn(),
}));

/**
 * @bulr/ai のモック。
 * createLlmContext は mockAnalyzeTurn / mockSplitInterviewerCandidate を束縛した
 * 決定論的コンテキストを返す。実際の Anthropic API は一切呼ばない。
 */
vi.mock('@bulr/ai', () => ({
  createLlmContext: vi.fn(() => ({
    analyzeTurn: mockAnalyzeTurn,
    splitInterviewerCandidate: mockSplitInterviewerCandidate,
    proposeNextQuestions: vi.fn().mockResolvedValue({ candidates: [] }),
    aggregatePatternCoverage: vi.fn().mockResolvedValue({
      authenticity: 1, judgment: 1, scope: 2, meta_cognition: 1, ai_literacy: 1,
      level_reached: 2, stuck_type: null, notes: '', evaluated_at: new Date().toISOString(),
    }),
    generateSessionReport: vi.fn().mockResolvedValue({ summary_text: '' }),
  })),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@bulr/db';
import type { LlmAnalysis } from '@bulr/types/evaluation';
import { evaluate, DEFAULT_SEGMENTER_CONFIG, runWithSessionLock } from './segmenter';
import { createWriteBackConsumer, writeBackLogicalTurns } from './turn-pipeline';

// ---------------------------------------------------------------------------
// テスト用モック LlmAnalysis（パターンマッチ: inferred_high）
// ---------------------------------------------------------------------------

const MOCK_ANALYSIS: LlmAnalysis = {
  signals: {
    authenticity: 'observed',
    judgment: 'partial',
    meta_cognition: 'absent',
    ai_literacy: 'absent',
  },
  scope_signal: 3,
  level_reached_estimate: 2,
  pattern_match_confidence: 'inferred_high',
  matched_pattern_id: null,
  stuck_signal: null,
  notes: 'テスト用モック分析',
};

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe('TurnPipeline — 統合テスト（DB バックド、LLM モック）', () => {
  let userId: string;
  let sessionId: string;

  // -------------------------------------------------------------------------
  // beforeEach / afterEach: テストごとに独立したユーザーとセッションを作成・削除
  // -------------------------------------------------------------------------

  beforeEach(async () => {
    if (!process.env['DATABASE_URL']) return;

    userId = crypto.randomUUID();
    sessionId = crypto.randomUUID();

    // LLM モックの戻り値をリセット（テストごとに独立）
    mockAnalyzeTurn.mockResolvedValue(MOCK_ANALYSIS);
    mockSplitInterviewerCandidate.mockResolvedValue({
      interviewer_text: '分離後面接官テキスト',
      candidate_text: '分離後候補者テキスト',
    });

    // Better Auth ユーザー（面接官）を挿入
    await db.insert(schema.user).values({
      id: userId,
      email: `pipeline-test-${userId}@example.com`,
      emailVerified: false,
      name: '面接官 テスト',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 面接セッション（recording 状態）
    await db.insert(schema.interviewSession).values({
      id: sessionId,
      interviewer_id: userId,
      status: 'in_progress',
      role: 'backend',
      planned_pattern_codes: [],
      capture_status: 'recording',
      started_at: new Date(Date.now() - 120_000),
      last_capture_event_at: new Date(Date.now() - 60_000),
    });
  });

  afterEach(async () => {
    if (!process.env['DATABASE_URL']) return;

    // FK 制約に従い子テーブルを先に削除
    // transcript_segment.logical_turn_id → interview_turn.id のため segment を先に削除
    await db
      .delete(schema.transcriptSegment)
      .where(eq(schema.transcriptSegment.session_id, sessionId));
    await db
      .delete(schema.interviewTurn)
      .where(eq(schema.interviewTurn.session_id, sessionId));
    await db
      .delete(schema.questionProposal)
      .where(eq(schema.questionProposal.session_id, sessionId));
    await db
      .delete(schema.interviewSession)
      .where(eq(schema.interviewSession.id, sessionId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  // -------------------------------------------------------------------------
  // ヘルパー: 面接官 Q + 候補者 A のセグメントペアを DB に挿入する
  // -------------------------------------------------------------------------

  async function seedQASegments(opts: { seq?: [number, number] } = {}): Promise<{
    qSegId: string;
    aSegId: string;
    qText: string;
    aText: string;
  }> {
    const [qSeq, aSeq] = opts.seq ?? [1, 2];
    const qSegId = crypto.randomUUID();
    const aSegId = crypto.randomUUID();
    const qText = '分散システム設計において最も重要にしていることを教えてください。';
    const aText =
      '主に一貫性とパフォーマンスのトレードオフを意識しています。CAP 定理に基づいてシステムの特性を整理し、ユースケースに応じて適切な設計を選択しています。具体的には...';

    await db.insert(schema.transcriptSegment).values({
      id: qSegId,
      session_id: sessionId,
      seq: qSeq,
      source_id: `src-q-${qSegId}`,
      speaker_role: 'interviewer',
      speaker_label: '面接官 テスト',
      text: qText,
      started_at_ms: 1000,
      ended_at_ms: 4000,
      origin: 'bot_realtime',
    });

    await db.insert(schema.transcriptSegment).values({
      id: aSegId,
      session_id: sessionId,
      seq: aSeq,
      source_id: `src-a-${aSegId}`,
      speaker_role: 'candidate',
      speaker_label: '候補者 テスト',
      text: aText,
      started_at_ms: 5000,
      ended_at_ms: 15000,
      origin: 'bot_realtime',
    });

    return { qSegId, aSegId, qText, aText };
  }

  // -------------------------------------------------------------------------
  // ヘルパー: unknown セグメント（対面モード用）を DB に挿入する
  // -------------------------------------------------------------------------

  async function seedUnknownSegments(): Promise<{
    segId: string;
    combinedText: string;
  }> {
    const segId = crypto.randomUUID();
    const combinedText =
      '設計で重視していることは？はい、一貫性とパフォーマンスのトレードオフを意識しています。CAP 定理に基づいて...';

    await db.insert(schema.transcriptSegment).values({
      id: segId,
      session_id: sessionId,
      seq: 1,
      source_id: `src-unk-${segId}`,
      speaker_role: 'unknown',
      speaker_label: null,
      text: combinedText,
      started_at_ms: 1000,
      ended_at_ms: 20000,
      origin: 'mic_chunk',
    });

    return { segId, combinedText };
  }

  // =========================================================================
  // (1) Normal turn write-back
  //
  // 通常ターン（Q+A）を処理 → interview_turn が 1 行、transcript JSON 形状確認
  // =========================================================================

  describe('(1) Normal turn write-back', () => {
    it(
      '通常 Q+A ターン → interview_turn 1 行、transcript {interviewer, candidate, raw}、audio_key=null',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        const { qSegId, aSegId, qText, aText } = await seedQASegments();

        // evaluate() で正しい fingerprint を持つ LogicalTurn を生成
        const closedTurns = evaluate({
          sessionId,
          segments: [
            {
              id: qSegId,
              seq: 1,
              speakerRole: 'interviewer',
              text: qText,
              startedAtMs: 1000,
              endedAtMs: 4000,
            },
            {
              id: aSegId,
              seq: 2,
              speakerRole: 'candidate',
              text: aText,
              startedAtMs: 5000,
              endedAtMs: 15000,
            },
          ],
          config: DEFAULT_SEGMENTER_CONFIG,
          forceCloseTrailing: true,
        });

        expect(closedTurns).toHaveLength(1);

        const consumer = createWriteBackConsumer(sessionId);
        await runWithSessionLock(sessionId, async (tx) => {
          await consumer(closedTurns, tx);
        });

        // interview_turn が 1 行挿入されていること
        const [row] = await db
          .select({ count: count() })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));
        expect(row?.count).toBe(1);

        // 挿入された行の内容を確認
        const [turn] = await db
          .select()
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));

        expect(turn).toBeDefined();
        // audio_key は null（セッション単位の capture_recording が音声を保持）
        expect(turn!.audio_key).toBeNull();
        // LLM 分析が設定されている
        expect(turn!.llm_analysis).toBeDefined();
        expect(turn!.llm_analysis.pattern_match_confidence).toBe('inferred_high');
        // turn_fingerprint が設定されている
        expect(turn!.turn_fingerprint).toBe(closedTurns[0]!.fingerprint);
        // duration_ms が設定されている（segmentの終了時刻 - 開始時刻）
        expect(turn!.duration_ms).toBeGreaterThanOrEqual(0);
      },
    );

    it('ProposalMatcher: proposal と一致する面接官テキスト → question_source が llm_candidate_N', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const candidateText =
        '分散システムにおける一貫性とパフォーマンスのトレードオフについて教えてください。';

      // candidate_1_text が面接官テキストと高い類似度を持つ proposal を挿入
      await db.insert(schema.questionProposal).values({
        session_id: sessionId,
        prepared_for_turn_no: 1,
        candidate_1_text: candidateText, // 面接官テキストと同一 → Dice 係数 1.0
        candidate_1_intent: 'deep_dive',
        candidate_2_text: '全く関係のない別の質問テキストです',
        candidate_2_intent: 'next_pattern',
        candidate_3_text: 'これも別の質問候補テキストです',
        candidate_3_intent: 'meta_cognition',
      });

      // 面接官テキストを proposal の candidate_1 と同一にする
      const qSegId = crypto.randomUUID();
      const aSegId = crypto.randomUUID();

      await db.insert(schema.transcriptSegment).values({
        id: qSegId,
        session_id: sessionId,
        seq: 1,
        source_id: `src-q-${qSegId}`,
        speaker_role: 'interviewer',
        text: candidateText,
        started_at_ms: 1000,
        ended_at_ms: 4000,
        origin: 'bot_realtime',
      });
      await db.insert(schema.transcriptSegment).values({
        id: aSegId,
        session_id: sessionId,
        seq: 2,
        source_id: `src-a-${aSegId}`,
        speaker_role: 'candidate',
        text: '一貫性を優先しています。具体的には Paxos アルゴリズムを利用して分散合意を実現しています。',
        started_at_ms: 5000,
        ended_at_ms: 15000,
        origin: 'bot_realtime',
      });

      const closedTurns = evaluate({
        sessionId,
        segments: [
          {
            id: qSegId,
            seq: 1,
            speakerRole: 'interviewer',
            text: candidateText,
            startedAtMs: 1000,
            endedAtMs: 4000,
          },
          {
            id: aSegId,
            seq: 2,
            speakerRole: 'candidate',
            text: '一貫性を優先しています。具体的には Paxos アルゴリズムを利用して分散合意を実現しています。',
            startedAtMs: 5000,
            endedAtMs: 15000,
          },
        ],
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      const consumer = createWriteBackConsumer(sessionId);
      await runWithSessionLock(sessionId, async (tx) => {
        await consumer(closedTurns, tx);
      });

      const [turn] = await db
        .select({ question_source: schema.interviewTurn.question_source })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));

      // candidate_1 と一致 → llm_candidate_1
      expect(turn?.question_source).toBe('llm_candidate_1');
    });

    it('proposal なし → question_source = manual', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const { qSegId, aSegId, qText, aText } = await seedQASegments();

      const closedTurns = evaluate({
        sessionId,
        segments: [
          { id: qSegId, seq: 1, speakerRole: 'interviewer', text: qText, startedAtMs: 1000, endedAtMs: 4000 },
          { id: aSegId, seq: 2, speakerRole: 'candidate', text: aText, startedAtMs: 5000, endedAtMs: 15000 },
        ],
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      const consumer = createWriteBackConsumer(sessionId);
      await runWithSessionLock(sessionId, async (tx) => {
        await consumer(closedTurns, tx);
      });

      const [turn] = await db
        .select({ question_source: schema.interviewTurn.question_source })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));

      expect(turn?.question_source).toBe('manual');
    });
  });

  // =========================================================================
  // (2) Unknown pending-split turn
  //
  // unknown-only セグメント（pendingSplit=true）→ splitInterviewerCandidate が呼ばれる
  // =========================================================================

  describe('(2) Unknown pending-split turn', () => {
    it(
      'pendingSplit=true ターン → splitInterviewerCandidate が呼ばれ、分離後テキストが transcript に反映される',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        const { segId, combinedText } = await seedUnknownSegments();

        const closedTurns = evaluate({
          sessionId,
          segments: [
            {
              id: segId,
              seq: 1,
              speakerRole: 'unknown',
              text: combinedText,
              startedAtMs: 1000,
              endedAtMs: 20000,
            },
          ],
          config: DEFAULT_SEGMENTER_CONFIG,
          forceCloseTrailing: true,
        });

        // 1 件の pendingSplit ターンが生成されること
        expect(closedTurns).toHaveLength(1);
        expect(closedTurns[0]!.pendingSplit).toBe(true);

        const consumer = createWriteBackConsumer(sessionId);
        await runWithSessionLock(sessionId, async (tx) => {
          await consumer(closedTurns, tx);
        });

        // splitInterviewerCandidate が呼ばれたこと
        expect(mockSplitInterviewerCandidate).toHaveBeenCalledOnce();
        expect(mockSplitInterviewerCandidate).toHaveBeenCalledWith({
          transcript: combinedText,
          questionTextHint: null,
        });

        // 挿入された interview_turn の transcript を確認
        const [turn] = await db
          .select()
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));

        expect(turn).toBeDefined();
        const transcript = turn!.transcript as { interviewer: string; candidate: string; raw: string };
        // モックの戻り値で分離されたテキストが設定されている
        expect(transcript.interviewer).toBe('分離後面接官テキスト');
        expect(transcript.candidate).toBe('分離後候補者テキスト');
        // raw には元の結合テキストが入る
        expect(transcript.raw).toBe(combinedText);
      },
    );
  });

  // =========================================================================
  // (3) Idempotency — re-run
  //
  // 同一 LogicalTurn を 2 回処理 → interview_turn は 1 行のまま
  // =========================================================================

  describe('(3) Idempotency — re-run', () => {
    it('同一ターンを 2 回連続処理 → interview_turn は 1 行のまま（fingerprint 冪等）', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const { qSegId, aSegId, qText, aText } = await seedQASegments();

      const closedTurns = evaluate({
        sessionId,
        segments: [
          { id: qSegId, seq: 1, speakerRole: 'interviewer', text: qText, startedAtMs: 1000, endedAtMs: 4000 },
          { id: aSegId, seq: 2, speakerRole: 'candidate', text: aText, startedAtMs: 5000, endedAtMs: 15000 },
        ],
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      const consumer = createWriteBackConsumer(sessionId);

      // 1 回目の書き戻し
      await runWithSessionLock(sessionId, async (tx) => {
        await consumer(closedTurns, tx);
      });

      // 2 回目の書き戻し（同一ターン）
      await runWithSessionLock(sessionId, async (tx) => {
        await consumer(closedTurns, tx);
      });

      // interview_turn は 1 行のまま
      const [row] = await db
        .select({ count: count() })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));
      expect(row?.count).toBe(1);

      // セグメントは claim 済みのまま（logical_turn_id が設定されている）
      const segments = await db
        .select({ logical_turn_id: schema.transcriptSegment.logical_turn_id })
        .from(schema.transcriptSegment)
        .where(eq(schema.transcriptSegment.session_id, sessionId));
      expect(segments).toHaveLength(2);
      segments.forEach((s) => {
        expect(s.logical_turn_id).not.toBeNull();
      });
    });
  });

  // =========================================================================
  // (4) Idempotency — concurrent
  //
  // 2 つの並行 runWithSessionLock → advisory lock で直列化され interview_turn は 1 行
  // =========================================================================

  describe('(4) Idempotency — concurrent', () => {
    it('2 つの並行 runWithSessionLock → advisory lock 直列化 → interview_turn は 1 行', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const { qSegId, aSegId, qText, aText } = await seedQASegments();

      const closedTurns = evaluate({
        sessionId,
        segments: [
          { id: qSegId, seq: 1, speakerRole: 'interviewer', text: qText, startedAtMs: 1000, endedAtMs: 4000 },
          { id: aSegId, seq: 2, speakerRole: 'candidate', text: aText, startedAtMs: 5000, endedAtMs: 15000 },
        ],
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      const consumer = createWriteBackConsumer(sessionId);

      // 2 つの runWithSessionLock を同時に起動（advisory lock で直列化される）
      await Promise.all([
        runWithSessionLock(sessionId, async (tx) => {
          await consumer(closedTurns, tx);
        }),
        runWithSessionLock(sessionId, async (tx) => {
          await consumer(closedTurns, tx);
        }),
      ]);

      // interview_turn は 1 行のまま（二重処理なし）
      const [row] = await db
        .select({ count: count() })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));
      expect(row?.count).toBe(1);
    });
  });

  // =========================================================================
  // (5) Admin visibility (6.2/6.4)
  //
  // interview_turn.transcript が既存の JSON 形状 {interviewer, candidate, raw} を持つこと
  // → 管理画面の「回答全文確認」が既存スキーマ経由で機能することを構造的に保証
  // =========================================================================

  describe('(5) Admin visibility (6.2/6.4) — transcript JSON 形状の契約確認', () => {
    it(
      'interview_turn.transcript が {interviewer, candidate, raw} を持ち、既存管理画面契約と一致する',
      async () => {
        if (!process.env['DATABASE_URL']) {
          console.warn('DATABASE_URL not set, skipping DB integration test');
          return;
        }

        const { qSegId, aSegId, qText, aText } = await seedQASegments();

        const closedTurns = evaluate({
          sessionId,
          segments: [
            { id: qSegId, seq: 1, speakerRole: 'interviewer', text: qText, startedAtMs: 1000, endedAtMs: 4000 },
            { id: aSegId, seq: 2, speakerRole: 'candidate', text: aText, startedAtMs: 5000, endedAtMs: 15000 },
          ],
          config: DEFAULT_SEGMENTER_CONFIG,
          forceCloseTrailing: true,
        });

        const consumer = createWriteBackConsumer(sessionId);
        await runWithSessionLock(sessionId, async (tx) => {
          await consumer(closedTurns, tx);
        });

        const [turn] = await db
          .select({ transcript: schema.interviewTurn.transcript })
          .from(schema.interviewTurn)
          .where(eq(schema.interviewTurn.session_id, sessionId));

        expect(turn).toBeDefined();
        const transcript = turn!.transcript as unknown;

        // 既存契約: transcript は { interviewer?, candidate, raw } のオブジェクト形状
        expect(typeof transcript).toBe('object');
        expect(transcript).not.toBeNull();

        const t = transcript as Record<string, unknown>;
        // interviewer フィールドが存在し文字列
        expect(typeof t['interviewer']).toBe('string');
        // candidate フィールドが存在し文字列（管理画面の「回答全文確認」が読む）
        expect(typeof t['candidate']).toBe('string');
        // raw フィールドが存在し文字列（元転写テキスト）
        expect(typeof t['raw']).toBe('string');

        // 通常ターン: interviewer = question.text, candidate = answer.text
        expect(t['interviewer']).toBe(qText);
        expect(t['candidate']).toBe(aText);
      },
    );
  });

  // =========================================================================
  // (6) セグメント claim の確認
  //
  // 書き戻し後に transcript_segment.logical_turn_id が設定されていること
  // =========================================================================

  describe('(6) Segment claim', () => {
    it('書き戻し後: transcript_segment.logical_turn_id が interview_turn.id と一致する', async () => {
      if (!process.env['DATABASE_URL']) {
        console.warn('DATABASE_URL not set, skipping DB integration test');
        return;
      }

      const { qSegId, aSegId, qText, aText } = await seedQASegments();

      const closedTurns = evaluate({
        sessionId,
        segments: [
          { id: qSegId, seq: 1, speakerRole: 'interviewer', text: qText, startedAtMs: 1000, endedAtMs: 4000 },
          { id: aSegId, seq: 2, speakerRole: 'candidate', text: aText, startedAtMs: 5000, endedAtMs: 15000 },
        ],
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      const consumer = createWriteBackConsumer(sessionId);
      await runWithSessionLock(sessionId, async (tx) => {
        await consumer(closedTurns, tx);
      });

      // interview_turn が挿入されていること
      const [turn] = await db
        .select({ id: schema.interviewTurn.id })
        .from(schema.interviewTurn)
        .where(eq(schema.interviewTurn.session_id, sessionId));
      expect(turn).toBeDefined();

      // セグメントの logical_turn_id が interview_turn.id と一致
      const segments = await db
        .select({ id: schema.transcriptSegment.id, logical_turn_id: schema.transcriptSegment.logical_turn_id })
        .from(schema.transcriptSegment)
        .where(eq(schema.transcriptSegment.session_id, sessionId));

      expect(segments).toHaveLength(2);
      segments.forEach((s) => {
        expect(s.logical_turn_id).toBe(turn!.id);
      });
    });
  });
});

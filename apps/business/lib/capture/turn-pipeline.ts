/**
 * TurnPipeline — 論理ターンの書き戻し（claim + analyzeTurn + 冪等 insert）
 *
 * task 4.2 の実装。LogicalTurn を interview_turn に書き戻す唯一のアダプタ。
 *
 * ## sessionId の取得方法
 * TickConsumer シームのシグネチャは `(turns, tx) => Promise<void>` であり、
 * `LogicalTurn` 自体は sessionId を持たない。そのため `createWriteBackConsumer(sessionId)`
 * ファクトリで sessionId をクロージャに束縛し、TickConsumer シグネチャを満たす。
 * 呼び出し元（live-state route）が sessionId を知っているため、注入コストは最小。
 *
 * ## Claim の原子性と並行安全性
 * 条件付き UPDATE（`logical_turn_id IS NULL`）と interview_turn INSERT は
 * 同一 tx（`runWithSessionLock` による pg_advisory_xact_lock 取得済み）内で行われる。
 * - セッション単位の advisory lock により、並行する webhook/tick の二重処理は防がれる。
 * - `(session_id, turn_fingerprint)` 一意制約は最終防衛線として機能する。
 *
 * ## Partial claim の扱い
 * advisory lock 下で claim UPDATE を実行するため、segmentIds の一部だけが
 * 既に claimed される状況は通常発生しない。更新行数 = 0 の場合（全て競合側が先取り）
 * のみ処理を放棄する。
 *
 * ## task 4.3 への接続点
 * interview_turn insert 後、`processTurn` の末尾にコメントで示した箇所に
 * `aggregatePatternCoverage` → `proposeNextQuestions` → `question_proposal` insert を追加する。
 * `llm:<sessionId>` レート制限（上限 150）の確認も 4.3 が担う。
 *
 * Requirements: 4.1, 4.4, 6.2, 6.4
 * Design: TurnPipeline (Responsibilities & Constraints), TurnSegmenter (claim ロジック)
 */

import 'server-only';

import { nanoid } from 'nanoid';
import { and, asc, desc, eq, inArray, isNull, lt, max, or, sql } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { createLlmContext } from '@bulr/ai';
import { loadRecentTurns } from '@bulr/db/queries';
import { buildLlmContext } from '@/lib/queries/build-llm-context';
import { checkRateLimit } from '@bulr/lib';
import { match } from './proposal-matcher';
import type { LogicalTurn } from './segmenter';
import type { TickConsumer } from './segmenter-tick';

// ---------------------------------------------------------------------------
// 型エイリアス
// ---------------------------------------------------------------------------

/** Drizzle トランザクション型（db.transaction コールバック引数から導出） */
type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** question_source enum 値 */
type QuestionSource =
  | 'llm_candidate_1'
  | 'llm_candidate_2'
  | 'llm_candidate_3'
  | 'manual';

// ---------------------------------------------------------------------------
// processTurn — 単一ターンの書き戻し
// ---------------------------------------------------------------------------

/**
 * 単一の確定済み論理ターンを claim して interview_turn に insert する。
 *
 * @param turn 確定済み論理ターン
 * @param tx advisory lock トランザクション（claim + insert を同一 tx に乗せる）
 * @param sessionId セッション UUID
 * @param session セッション行（writeBackLogicalTurns で事前ロード済み）
 * @param llm LLM コンテキスト（writeBackLogicalTurns で事前ビルド済み、全ターンで再利用）
 * @param latestProposal 最新の question_proposal（ProposalMatcher 用、null = proposal なし）
 */
async function processTurn(
  turn: LogicalTurn,
  tx: DrizzleTransaction,
  sessionId: string,
  session: typeof schema.interviewSession.$inferSelect,
  llm: ReturnType<typeof createLlmContext>,
  latestProposal: typeof schema.questionProposal.$inferSelect | null,
): Promise<void> {
  const turnId = nanoid();

  // 全セグメント ID（質問 + 回答）
  const allSegmentIds = [...turn.question.segmentIds, ...turn.answer.segmentIds];
  if (allSegmentIds.length === 0) return;

  // -----------------------------------------------------------------
  // Step 1: 未 claim セグメントの事前確認
  //
  // `logical_turn_id IS NULL` のセグメントが存在しない場合、
  // 全セグメントは既に別の tick により claim 済み → このターンを放棄する。
  //
  // FK 制約の理由:
  //   `transcript_segment.logical_turn_id → interview_turn.id` の FK により、
  //   `interview_turn` INSERT の前に `logical_turn_id` を設定することはできない。
  //   そのため「事前確認（step 1）→ LLM 処理 → INSERT（step 7）→ claim（step 8）」の順序とする。
  //
  // 並行安全性:
  //   pg_advisory_xact_lock（runWithSessionLock）でセッション単位の直列化が保証されているため、
  //   step 1 の確認から step 8 の claim までの間に別の tx が同一セグメントを claim することはない。
  //   `(session_id, turn_fingerprint)` 一意制約は最終防衛線として維持する。
  // -----------------------------------------------------------------
  const [unclaimedSegment] = await tx
    .select({ id: schema.transcriptSegment.id })
    .from(schema.transcriptSegment)
    .where(
      and(
        inArray(schema.transcriptSegment.id, allSegmentIds),
        isNull(schema.transcriptSegment.logical_turn_id),
      ),
    )
    .limit(1);

  // 未 claim セグメントが 1 件もない → 全て既に claim 済み → 放棄
  if (!unclaimedSegment) return;

  // -----------------------------------------------------------------
  // Step 2: duration_ms の計算
  //
  // セグメントのタイムスタンプ（tx 内で取得）から算出する。
  // -----------------------------------------------------------------
  const segmentTimestamps = await tx
    .select({
      started_at_ms: schema.transcriptSegment.started_at_ms,
      ended_at_ms: schema.transcriptSegment.ended_at_ms,
    })
    .from(schema.transcriptSegment)
    .where(inArray(schema.transcriptSegment.id, allSegmentIds));

  const startMs =
    segmentTimestamps.length > 0
      ? Math.min(...segmentTimestamps.map((s) => s.started_at_ms))
      : 0;
  const endMs =
    segmentTimestamps.length > 0
      ? Math.max(...segmentTimestamps.map((s) => s.ended_at_ms))
      : 0;
  const durationMs = Math.max(0, endMs - startMs);

  // -----------------------------------------------------------------
  // Step 3: 話者テキストの解決
  //
  // pendingSplit=true（unknown-only 対面モード）:
  //   → answer.text に全セグメントのテキストが結合されている
  //   → splitInterviewerCandidate で質問/回答を分離する
  //
  // 通常ターン（話者付き）:
  //   → interviewer = question.text, candidate = answer.text
  // -----------------------------------------------------------------
  let interviewerText: string;
  let candidateText: string;
  let rawText: string;

  if (turn.pendingSplit) {
    // answer.text に全セグメントのテキストが入る（segmenter.ts: buildPendingTurn より）
    rawText = turn.answer.text;
    const split = await llm.splitInterviewerCandidate({
      transcript: rawText,
      questionTextHint: null,
    });
    interviewerText = split.interviewer_text;
    candidateText = split.candidate_text;
  } else {
    interviewerText = turn.question.text;
    candidateText = turn.answer.text;
    rawText = interviewerText + candidateText;
  }

  // transcript JSON（既存形状を維持: Req 4.4, 6.2, 6.4）
  // audio_key は null — 音声はセッション単位の capture_recording が保持する（design.md）
  const transcript = {
    interviewer: interviewerText,
    candidate: candidateText,
    raw: rawText,
  };

  // -----------------------------------------------------------------
  // Step 4: analyzeTurn（LLM 評価）
  //
  // 候補者回答テキストを analyzeTurn に渡す。
  // history は直近 10 ターンの question/answer 対。
  // currentPattern は呼び出し元が指定しない（pipeline は agenda から独立）ため省略。
  // -----------------------------------------------------------------
  const recentTurns = await loadRecentTurns(sessionId, 10);
  const history = recentTurns.map((t) => ({
    question: t.question_text,
    answer: (t.transcript as { candidate: string }).candidate,
  }));

  const analysisResult = await llm.analyzeTurn({
    transcript: candidateText,
    history,
  });

  // -----------------------------------------------------------------
  // Step 5: effectivePatternId の解決
  //
  // off_pattern → null
  // exact/inferred_high → matched_pattern_id を id または code で DB 解決
  // inferred_low → null（信頼度不十分）
  //
  // pipeline は client 指定の patternId を持たないため、
  // LLM 信頼度が高い場合のみ matched_pattern_id から解決する。
  // -----------------------------------------------------------------
  let effectivePatternId: string | null = null;
  if (analysisResult.pattern_match_confidence !== 'off_pattern') {
    const llmMatched = ['exact', 'inferred_high'].includes(
      analysisResult.pattern_match_confidence,
    )
      ? (analysisResult.matched_pattern_id ?? null)
      : null;

    if (llmMatched) {
      const [patternRow] = await tx
        .select({ id: schema.assessmentPattern.id })
        .from(schema.assessmentPattern)
        .where(
          or(
            eq(schema.assessmentPattern.id, llmMatched),
            eq(schema.assessmentPattern.code, llmMatched),
          ),
        )
        .limit(1);
      effectivePatternId = patternRow?.id ?? null;
    }
  }

  // -----------------------------------------------------------------
  // Step 6: question_source（ProposalMatcher）
  //
  // 最新 question_proposal と面接官テキストを照合し、
  // 使用質問が提示 3 候補のどれかを判別する。
  // proposal なし / 類似度閾値未満 → 'manual'（フリー質問）
  // -----------------------------------------------------------------
  const proposalCandidates: [string, string, string] | null = latestProposal
    ? [
        latestProposal.candidate_1_text,
        latestProposal.candidate_2_text,
        latestProposal.candidate_3_text,
      ]
    : null;

  const matchResult = match({
    interviewerText,
    proposal: proposalCandidates ? { candidates: proposalCandidates } : null,
  });

  const questionSource: QuestionSource =
    matchResult.source === 'proposal'
      ? (`llm_candidate_${matchResult.selectedIndex + 1}` as QuestionSource)
      : 'manual';

  // -----------------------------------------------------------------
  // Step 7: sequence_no = MAX + 1 + 冪等 insert（同一 tx 内でアトミック）
  //
  // interview_turn を先に INSERT する理由:
  //   `transcript_segment.logical_turn_id → interview_turn.id` の FK 制約により、
  //   segment claim（step 8）の前に interview_turn が存在している必要がある。
  //
  // 冪等性:
  //   `(session_id, turn_fingerprint)` 一意制約 + onConflictDoNothing で、
  //   同一 fingerprint の重複 insert は no-op となる（step 8 でセグメントは claim しない）。
  //   通常の再実行では step 1 の未 claim 確認で事前放棄されるため、
  //   ここでの no-op は最終防衛線として機能する。
  // -----------------------------------------------------------------
  const [seqRow] = await tx
    .select({ maxSeq: max(schema.interviewTurn.sequence_no) })
    .from(schema.interviewTurn)
    .where(eq(schema.interviewTurn.session_id, sessionId));
  const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

  const insertedRows = await tx
    .insert(schema.interviewTurn)
    .values({
      id: turnId,
      session_id: sessionId,
      sequence_no: nextSeq,
      pattern_id: effectivePatternId,
      asked_pattern_id: null,
      proposal_id: latestProposal?.id ?? null,
      question_source: questionSource,
      question_text: interviewerText,
      audio_key: null,
      audio_expires_at: null,
      transcript,
      llm_analysis: analysisResult,
      pattern_match_confidence: analysisResult.pattern_match_confidence,
      off_pattern_summary: analysisResult.off_pattern_summary ?? null,
      duration_ms: durationMs,
      turn_fingerprint: turn.fingerprint,
    })
    .onConflictDoNothing({
      target: [
        schema.interviewTurn.session_id,
        schema.interviewTurn.turn_fingerprint,
      ],
    })
    .returning(); // full row — sequence_no needed for Prepare-2

  // fingerprint 衝突で no-op → このターンは既に別経路で処理済み
  // （正常系では step 1 で事前検出されているが、最終防衛線として処理）
  if (insertedRows.length === 0) return;

  const insertedTurn = insertedRows[0]!;

  // -----------------------------------------------------------------
  // [TASK 4.3] Rate-limit increment（同一 tx 内でアトミック）
  //
  // ターン 1 件の処理（analyzeTurn + optional aggregate + propose）を 1 単位として
  // llm:<sessionId> カウンタをインクリメントする。
  // cap gate は writeBackLogicalTurns の先頭で事前チェック済みのため、
  // ここでは超過判定を行わず純粋にインクリメントのみを行う。
  // -----------------------------------------------------------------
  await tx.execute<{ count: number }>(sql`
    INSERT INTO rate_limit (key, count, window_start)
    VALUES (${'llm:' + sessionId}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit.window_start + (${86_400_000} * INTERVAL '1 millisecond') > now()
        THEN rate_limit.count + 1
        ELSE 1
      END,
      window_start = CASE
        WHEN rate_limit.window_start + (${86_400_000} * INTERVAL '1 millisecond') > now()
        THEN rate_limit.window_start
        ELSE now()
      END
    RETURNING count
  `);

  // -----------------------------------------------------------------
  // Step 8: Segment claim（interview_turn insert 後、FK 制約を満たしてから実行）
  //
  // advisory lock 下で step 1 の確認から連続して実行しているため、
  // ここで claim する際も unclaimed セグメントが存在することが保証される。
  // -----------------------------------------------------------------
  await tx
    .update(schema.transcriptSegment)
    .set({ logical_turn_id: turnId })
    .where(
      and(
        inArray(schema.transcriptSegment.id, allSegmentIds),
        isNull(schema.transcriptSegment.logical_turn_id),
      ),
    );

  // -----------------------------------------------------------------
  // [TASK 4.3] Prepare-1a: 前パターンからの遷移集約
  //
  // 直前ターンのパターンが現在ターンと異なる場合（パターン遷移）、
  // 前パターンの全ターンを集約して pattern_coverage を upsert する。
  // 単発失敗は try/catch で吸収し、ターン insert は維持する。
  // -----------------------------------------------------------------
  let transitionCoverage: typeof schema.patternCoverage.$inferSelect | null = null;
  try {
    const [previousTurn] = await tx
      .select()
      .from(schema.interviewTurn)
      .where(
        and(
          eq(schema.interviewTurn.session_id, sessionId),
          lt(schema.interviewTurn.sequence_no, insertedTurn.sequence_no),
        ),
      )
      .orderBy(desc(schema.interviewTurn.sequence_no))
      .limit(1);

    const transitionDetected =
      previousTurn?.pattern_id != null && previousTurn.pattern_id !== effectivePatternId;

    if (transitionDetected && previousTurn?.pattern_id) {
      const [previousPattern] = await tx
        .select()
        .from(schema.assessmentPattern)
        .where(eq(schema.assessmentPattern.id, previousTurn.pattern_id))
        .limit(1);

      if (previousPattern) {
        const previousPatternTurns = await tx
          .select()
          .from(schema.interviewTurn)
          .where(
            and(
              eq(schema.interviewTurn.session_id, sessionId),
              eq(schema.interviewTurn.pattern_id, previousTurn.pattern_id),
            ),
          )
          .orderBy(asc(schema.interviewTurn.sequence_no));

        const llmEvaluation = await llm.aggregatePatternCoverage({
          turns: previousPatternTurns,
          pattern: previousPattern,
        });

        const [tc] = await tx
          .insert(schema.patternCoverage)
          .values({
            session_id: sessionId,
            pattern_id: previousTurn.pattern_id,
            level_reached: llmEvaluation.level_reached,
            stuck_type: llmEvaluation.stuck_type,
            llm_evaluation: llmEvaluation,
            manual_evaluation: null,
            turn_ids: previousPatternTurns.map((t) => t.id),
            finalized_at: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.patternCoverage.session_id, schema.patternCoverage.pattern_id],
            set: {
              level_reached: llmEvaluation.level_reached,
              stuck_type: llmEvaluation.stuck_type,
              llm_evaluation: llmEvaluation,
              turn_ids: previousPatternTurns.map((t) => t.id),
              finalized_at: new Date(),
            },
          })
          .returning();
        transitionCoverage = tc ?? null;
      }
    }
  } catch (e) {
    console.error('[turn-pipeline] Prepare-1a transition aggregateCov failed', e);
  }

  // -----------------------------------------------------------------
  // [TASK 4.3] Prepare-1b: 同一パターン完了集約
  //
  // analyzeTurn が完了シグナル（level_reached_estimate=4 または stuck_signal 非 null）を
  // 返し、effectivePatternId が解決されている場合に pattern_coverage を upsert する。
  // 完了判定: analysisResult.level_reached_estimate === 4 || analysisResult.stuck_signal != null
  // （design.md TurnPipeline / turns/next Prepare-1b と同一判定）
  // -----------------------------------------------------------------
  let coverage: typeof schema.patternCoverage.$inferSelect | null = null;
  try {
    const completionSignaled =
      analysisResult.level_reached_estimate === 4 || analysisResult.stuck_signal != null;

    if (completionSignaled && effectivePatternId) {
      const [currentPattern] = await tx
        .select()
        .from(schema.assessmentPattern)
        .where(eq(schema.assessmentPattern.id, effectivePatternId))
        .limit(1);

      if (currentPattern) {
        const patternTurns = await tx
          .select()
          .from(schema.interviewTurn)
          .where(
            and(
              eq(schema.interviewTurn.session_id, sessionId),
              eq(schema.interviewTurn.pattern_id, effectivePatternId),
            ),
          )
          .orderBy(asc(schema.interviewTurn.sequence_no));

        const llmEvaluation = await llm.aggregatePatternCoverage({
          turns: patternTurns,
          pattern: currentPattern,
        });

        const [c] = await tx
          .insert(schema.patternCoverage)
          .values({
            session_id: sessionId,
            pattern_id: effectivePatternId,
            level_reached: llmEvaluation.level_reached,
            stuck_type: llmEvaluation.stuck_type,
            llm_evaluation: llmEvaluation,
            manual_evaluation: null,
            turn_ids: patternTurns.map((t) => t.id),
            finalized_at: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.patternCoverage.session_id, schema.patternCoverage.pattern_id],
            set: {
              level_reached: llmEvaluation.level_reached,
              stuck_type: llmEvaluation.stuck_type,
              llm_evaluation: llmEvaluation,
              turn_ids: patternTurns.map((t) => t.id),
              finalized_at: new Date(),
            },
          })
          .returning();
        coverage = c ?? null;
      }
    }
  } catch (e) {
    console.error('[turn-pipeline] Prepare-1b completion aggregateCov failed', e);
  }

  // -----------------------------------------------------------------
  // [TASK 4.3] Prepare-2: 次の質問候補生成（常に実行）
  //
  // proposeNextQuestions は完了シグナルの有無に関わらず常に呼ぶ（3.2: 質問候補 3 件常時表示）。
  // next_pattern 1 件保証は proposeNextQuestions 既存関数の契約を継承（3.4）。
  // coverage が更新された場合のみ llm コンテキストを再構築する（QW6: DB 負荷最小化）。
  //
  // prepared_for_turn_no = insertedTurn.sequence_no + 1（Req 3.2: 次のターン向け）
  // -----------------------------------------------------------------
  try {
    const coverageWasUpdated = transitionCoverage !== null || coverage !== null;
    const llmForProposals = coverageWasUpdated
      ? createLlmContext(await buildLlmContext({ session, userId: session.interviewer_id }))
      : llm;

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.interviewTurn)
      .where(eq(schema.interviewTurn.session_id, sessionId));
    const turnCount = countRow?.count ?? 0;

    const elapsedMs = session.started_at ? Date.now() - session.started_at.getTime() : 0;
    const elapsedMinutes = Math.floor(elapsedMs / 60000);

    const proposals = await llmForProposals.proposeNextQuestions({
      sessionState: { turnCount, elapsedMinutes },
    });

    await tx.insert(schema.questionProposal).values({
      session_id: sessionId,
      prepared_for_turn_no: insertedTurn.sequence_no + 1,
      candidate_1_text: proposals.candidates[0]?.text ?? '',
      candidate_1_intent: proposals.candidates[0]?.intent ?? 'deep_dive',
      candidate_2_text: proposals.candidates[1]?.text ?? '',
      candidate_2_intent: proposals.candidates[1]?.intent ?? 'deep_dive',
      candidate_3_text: proposals.candidates[2]?.text ?? '',
      candidate_3_intent: proposals.candidates[2]?.intent ?? 'next_pattern',
      selected_index: null,
    });
  } catch (e) {
    console.error('[turn-pipeline] Prepare-2 proposeNextQ failed', e);
  }
}

// ---------------------------------------------------------------------------
// writeBackLogicalTurns — 複数ターンの一括書き戻し
// ---------------------------------------------------------------------------

/**
 * 確定済み論理ターンのリストを interview_turn に書き戻す。
 * advisory lock トランザクション内で呼ばれ、各ターンを順次処理する。
 *
 * LLM コンテキストと最新 proposal はバッチ先頭で一度だけロードし、
 * 全ターンで再利用する（DB アクセス最小化）。
 *
 * @param turns evaluate() が返した確定済み論理ターン
 * @param tx pg_advisory_xact_lock 取得済みのトランザクション
 * @param sessionId ロック対象のセッション UUID
 */
export async function writeBackLogicalTurns(
  turns: LogicalTurn[],
  tx: DrizzleTransaction,
  sessionId: string,
): Promise<void> {
  if (turns.length === 0) return;

  // セッション読み込み（tx 内で一貫性を担保）
  const [session] = await tx
    .select()
    .from(schema.interviewSession)
    .where(eq(schema.interviewSession.id, sessionId))
    .limit(1);

  if (!session) return;

  const userId = session.interviewer_id;

  // ---------------------------------------------------------------------------
  // [TASK 4.3] Cap gate: llm:<sessionId> 上限 150 の事前チェック（Req 4.5）
  //
  // バッチ全体の LLM 処理を開始する前に read-only で現在のカウントを確認する。
  // 上限到達（count >= 150）の場合:
  //   - analysis_capped_at を設定（既に設定済みの場合は no-op）
  //   - 全 LLM 解析をスキップして早期リターン
  //   - transcript_segment の永続化は呼び出し元（webhook/chunk ルート）が行うため継続
  //
  // 観測可能な完了（Req 4.5）:
  //   上限到達後はセグメントだけが増え続け、interview_turn / coverage / proposal は生成されない。
  // ---------------------------------------------------------------------------
  const llmCapCount = await checkRateLimit(`llm:${sessionId}`, {
    limit: 150,
    windowMs: 86_400_000,
  });
  if (llmCapCount >= 150) {
    // analysis_capped_at が未設定の場合のみ更新（冪等）
    if (!session.analysis_capped_at) {
      await tx
        .update(schema.interviewSession)
        .set({ analysis_capped_at: new Date() })
        .where(
          and(
            eq(schema.interviewSession.id, sessionId),
            isNull(schema.interviewSession.analysis_capped_at),
          ),
        );
    }
    return; // 全 LLM 解析をスキップ
  }

  // LLM コンテキストをバッチ先頭で一度だけビルド（全ターンで再利用）
  // buildLlmContext は module-level db で読み取り専用クエリを行う（tx と別接続だが許容）
  const llm = createLlmContext(await buildLlmContext({ session, userId }));

  // 最新 question_proposal（ProposalMatcher 用、バッチ内全ターンで共通）
  const [latestProposal] = await tx
    .select()
    .from(schema.questionProposal)
    .where(eq(schema.questionProposal.session_id, sessionId))
    .orderBy(
      desc(schema.questionProposal.prepared_for_turn_no),
      desc(schema.questionProposal.generated_at),
    )
    .limit(1);

  // ターンを順次処理（sequence_no の整合性を保つため逐次実行）
  for (const turn of turns) {
    await processTurn(turn, tx, sessionId, session, llm, latestProposal ?? null);
  }
}

// ---------------------------------------------------------------------------
// createWriteBackConsumer — TickConsumer ファクトリ
// ---------------------------------------------------------------------------

/**
 * sessionId をクロージャに束縛した TickConsumer を生成する。
 *
 * TickConsumer シームのシグネチャ `(turns, tx) => Promise<void>` は sessionId を
 * 引数に持たないため、ファクトリパターンで sessionId を事前に閉じ込める。
 * 呼び出し元（live-state route）が sessionId を知っているため注入コストは最小。
 *
 * @param sessionId 書き戻し対象のセッション UUID
 * @returns TickConsumer シームに注入可能なコンシューマ関数
 */
export function createWriteBackConsumer(sessionId: string): TickConsumer {
  return async (turns: LogicalTurn[], tx: DrizzleTransaction): Promise<void> => {
    await writeBackLogicalTurns(turns, tx, sessionId);
  };
}

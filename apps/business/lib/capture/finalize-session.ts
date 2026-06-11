/**
 * finalizeSession — 面接終了処理のコア実装（インタラクティブルート / Webhook フック共用）
 *
 * 呼び出し元:
 *  1. POST /api/interview/finalize ルート（authed: requireUser + requireSessionOwnership 済み）
 *  2. /api/webhooks/recall の bot.call_ended フック（サーバー起点、ユーザーセッションなし）
 *
 * 前処理順（design.md FinalizeExtension）:
 *  ① leaveBot（5.1）       — best-effort（失敗してもレポート生成へ進む）
 *  ② 未消費セグメントのフラッシュ（5.3）— runWithSessionLock + evaluate(forceCloseTrailing) + writeBack
 *  ③ ボット録音の Blob 転送（2.7）   — best-effort、idempotency guard あり
 *  ④ 既存集約 → generateSessionReport → session_report upsert → status='completed'（5.3）
 *
 * 冪等性（5.5）:
 *  - フラッシュ: turn_fingerprint 一意制約 + segment claim により重複ターンなし
 *  - ボット録音: 既存 bot_full 行チェックによりスキップ
 *  - session_report upsert: onConflictDoUpdate により冪等
 *  - status='completed': update は冪等
 *
 * Requirements: 2.7, 5.1, 5.2, 5.3, 5.5
 * Design: FinalizeExtension（/api/interview/finalize 改修）/ System Flows（面接終了とフォールバック）
 */

import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';

import { db, schema } from '@bulr/db';
import { aggregateHeatmap, createLlmContext } from '@bulr/ai';
import { buildLlmContext } from '@/lib/queries/build-llm-context';
import { uploadToBlob } from '@/lib/audio/blob-client';
import { createRecallClient } from './recall-client';
import {
  DEFAULT_SEGMENTER_CONFIG,
  evaluate,
  runWithSessionLock,
  type SegmentInput,
} from './segmenter';
import { createWriteBackConsumer } from './turn-pipeline';

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export interface FinalizeSessionInput {
  /** 終了処理対象のセッション UUID */
  sessionId: string;
  /**
   * 実行コンテキストのユーザー ID（= セッションの interviewer_id）。
   * 認証済みルートでは requireUser の戻り値から取得する。
   * Webhook フックではセッション行の interviewer_id を渡す。
   */
  userId: string;
}

export type FinalizeSessionResult =
  | { ok: true; redirect: string }
  | { ok: false; error: string; retryable?: boolean; status: number };

// ---------------------------------------------------------------------------
// finalizeSession
// ---------------------------------------------------------------------------

/**
 * 面接終了処理のコアロジック。
 *
 * ① leaveBot → ② セグメントフラッシュ → ③ ボット録音 Blob 転送 → ④ 集約・レポート生成
 *
 * 失敗時は error 情報を含む FinalizeSessionResult を返す（throw しない）。
 * 呼び出し元はステータスコードをそのままレスポンスに使用できる。
 */
export async function finalizeSession(
  input: FinalizeSessionInput,
): Promise<FinalizeSessionResult> {
  const { sessionId, userId } = input;

  // セッション取得
  const session = await db.query.interviewSession.findFirst({
    where: eq(schema.interviewSession.id, sessionId),
  });

  if (!session) {
    return { ok: false, error: 'forbidden', status: 403 };
  }

  // ------------------------------------------------------------------
  // ① leaveBot（design.md: 5.1）
  //
  // capture_provider='recall' かつ bot_id が設定されている場合のみ呼ぶ。
  // ボットが既に退出済みの場合も API エラーになるが、best-effort なので続行する。
  // ------------------------------------------------------------------
  if (session.bot_id && session.capture_provider === 'recall') {
    try {
      const recall = createRecallClient();
      const leaveResult = await recall.leaveBot(session.bot_id);
      if (!leaveResult.ok) {
        console.warn(
          `[finalize-session] leaveBot failed (continuing): ` +
            `sessionId=${sessionId}, error=${JSON.stringify(leaveResult.error)}`,
        );
      }
    } catch (e) {
      console.warn(
        `[finalize-session] leaveBot threw (continuing): sessionId=${sessionId}`,
        e,
      );
    }
  }

  // ------------------------------------------------------------------
  // ② 未消費セグメントのフラッシュ（design.md: 5.3）
  //
  // logical_turn_id IS NULL のセグメントを force-close して論理ターン化する。
  // runWithSessionLock で直列化し、既存の冪等設計（turn_fingerprint 一意制約）を継承する。
  // ------------------------------------------------------------------
  try {
    await runWithSessionLock(sessionId, async (tx) => {
      const rawSegments = await tx
        .select()
        .from(schema.transcriptSegment)
        .where(
          and(
            eq(schema.transcriptSegment.session_id, sessionId),
            isNull(schema.transcriptSegment.logical_turn_id),
          ),
        )
        .orderBy(asc(schema.transcriptSegment.started_at_ms));

      if (rawSegments.length === 0) return;

      const segments: SegmentInput[] = rawSegments.map((s) => ({
        id: s.id,
        seq: s.seq,
        speakerRole: s.speaker_role,
        text: s.text,
        startedAtMs: s.started_at_ms,
        endedAtMs: s.ended_at_ms,
      }));

      // forceCloseTrailing=true: 末尾の未確定ターンも強制的に emit する（フラッシュ）
      const closedTurns = evaluate({
        sessionId,
        segments,
        config: DEFAULT_SEGMENTER_CONFIG,
        forceCloseTrailing: true,
      });

      if (closedTurns.length > 0) {
        await createWriteBackConsumer(sessionId)(closedTurns, tx);
      }
    });
  } catch (e) {
    console.error(
      `[finalize-session] segment flush failed (continuing): sessionId=${sessionId}`,
      e,
    );
    // フラッシュ失敗は続行 — 既存ターンに基づきレポート生成を試みる（5.5）
  }

  // ------------------------------------------------------------------
  // ③ ボット録音 Blob 転送（design.md: 2.7）
  //
  // capture_provider='recall' かつ bot_id がある場合のみ実行する。
  // 冪等ガード: 既に bot_full 行が存在する場合はスキップ（再実行で重複しない、5.5）。
  // best-effort: ダウンロード/アップロード失敗はログして続行。
  // ------------------------------------------------------------------
  if (session.capture_provider === 'recall' && session.bot_id) {
    try {
      // idempotency guard: 既存 bot_full 行の確認
      const existingRecording = await db.query.captureRecording.findFirst({
        where: and(
          eq(schema.captureRecording.session_id, sessionId),
          eq(schema.captureRecording.kind, 'bot_full'),
        ),
      });

      if (!existingRecording) {
        const recall = createRecallClient();
        const urlResult = await recall.getRecordingDownloadUrl(session.bot_id);

        if (urlResult.ok) {
          const audioResponse = await fetch(urlResult.value.url);
          if (audioResponse.ok) {
            const audioBuffer = await audioResponse.arrayBuffer();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
            const key = `capture-bot/${sessionId}.webm`;
            const { audioKey, audioExpiresAt } = await uploadToBlob(audioBlob, key);

            await db.insert(schema.captureRecording).values({
              session_id: sessionId,
              kind: 'bot_full',
              chunk_no: null,
              audio_key: audioKey,
              audio_expires_at: audioExpiresAt, // uploadToBlob が now+30d を設定する
            });

            console.info(
              `[finalize-session] bot recording transferred: ` +
                `sessionId=${sessionId}, audioKey=${audioKey}`,
            );
          } else {
            console.warn(
              `[finalize-session] recording download failed (continuing): ` +
                `sessionId=${sessionId}, httpStatus=${audioResponse.status}`,
            );
          }
        } else {
          console.warn(
            `[finalize-session] getRecordingDownloadUrl failed (continuing): ` +
              `sessionId=${sessionId}, error=${JSON.stringify(urlResult.error)}`,
          );
        }
      } else {
        console.info(
          `[finalize-session] bot_full recording already exists, skipping transfer: sessionId=${sessionId}`,
        );
      }
    } catch (e) {
      console.warn(
        `[finalize-session] bot recording transfer threw (continuing): sessionId=${sessionId}`,
        e,
      );
    }
  }

  // ------------------------------------------------------------------
  // ④ 既存集約・レポート生成（finalize/route.ts から移植・不変）
  //
  // Requirements 11.2-11.8 に対応する既存ロジックをそのまま維持する。
  // ------------------------------------------------------------------

  // LLM コンテキストのビルド
  const llm = createLlmContext(
    await buildLlmContext({ session, userId }),
  );

  // 未完了パターンの抽出と coverage 集約
  try {
    const allPatternTurns = await db.query.interviewTurn.findMany({
      where: and(eq(schema.interviewTurn.session_id, sessionId)),
      orderBy: [asc(schema.interviewTurn.sequence_no)],
    });

    const usedPatternIds = [
      ...new Set(
        allPatternTurns
          .map((t) => t.pattern_id)
          .filter((id): id is string => id !== null),
      ),
    ];

    if (usedPatternIds.length > 0) {
      const allExistingCoverage = await db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      });
      const alreadyCoveredIds = new Set(allExistingCoverage.map((c) => c.pattern_id));
      const uncoveredPatternIds = usedPatternIds.filter((id) => !alreadyCoveredIds.has(id));

      for (const patternId of uncoveredPatternIds) {
        try {
          const pattern = await db.query.assessmentPattern.findFirst({
            where: eq(schema.assessmentPattern.id, patternId),
          });
          if (!pattern) continue;

          const turns = allPatternTurns.filter((t) => t.pattern_id === patternId);
          const llmEvaluation = await llm.aggregatePatternCoverage({ turns, pattern });

          await db
            .insert(schema.patternCoverage)
            .values({
              session_id: sessionId,
              pattern_id: patternId,
              level_reached: llmEvaluation.level_reached,
              stuck_type: llmEvaluation.stuck_type,
              llm_evaluation: llmEvaluation,
              manual_evaluation: null,
              turn_ids: turns.map((t) => t.id),
              finalized_at: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.patternCoverage.session_id, schema.patternCoverage.pattern_id],
              set: {
                level_reached: llmEvaluation.level_reached,
                stuck_type: llmEvaluation.stuck_type,
                llm_evaluation: llmEvaluation,
                turn_ids: turns.map((t) => t.id),
                finalized_at: new Date(),
              },
            });
        } catch (e) {
          console.error(
            `[finalize-session] aggregatePatternCoverage failed for patternId=${patternId}`,
            e,
          );
          // 個別パターンの失敗は続行
        }
      }
    }
  } catch (e) {
    console.error(
      `[finalize-session] uncovered pattern extraction failed for sessionId=${sessionId}`,
      e,
    );
    // 集約失敗は続行してレポート生成へ
  }

  // 全 pattern_coverage + フリー質問 + パターン + ターン を取得
  let allCoverage: typeof schema.patternCoverage.$inferSelect[];
  let freeQuestions: typeof schema.interviewTurn.$inferSelect[];
  let allPatterns: typeof schema.assessmentPattern.$inferSelect[];
  let allTurns: typeof schema.interviewTurn.$inferSelect[];
  try {
    [allCoverage, freeQuestions, allPatterns, allTurns] = await Promise.all([
      db.query.patternCoverage.findMany({
        where: eq(schema.patternCoverage.session_id, sessionId),
      }),
      db.query.interviewTurn.findMany({
        where: and(
          eq(schema.interviewTurn.session_id, sessionId),
          isNull(schema.interviewTurn.pattern_id),
        ),
        orderBy: [asc(schema.interviewTurn.sequence_no)],
      }),
      db.query.assessmentPattern.findMany(),
      db.query.interviewTurn.findMany({
        where: eq(schema.interviewTurn.session_id, sessionId),
      }),
    ]);
  } catch (e) {
    console.error(
      `[finalize-session] failed to load coverage/freeQuestions/patterns/turns for sessionId=${sessionId}`,
      e,
    );
    return { ok: false, error: 'data_load_failed', retryable: true, status: 503 };
  }

  // ヒートマップデータの生成（決定論）
  const heatmap_data = aggregateHeatmap({
    allCoverage,
    freeQuestions,
    allPatterns,
    allTurns,
  });

  // セッションレポートの生成（LLM）
  const reportLlm = createLlmContext(
    await buildLlmContext({ session, userId }),
  );
  let summary: { summary_text: string };
  try {
    summary = await reportLlm.generateSessionReport({
      allCoverage,
      freeQuestions,
    });
  } catch (e) {
    console.error(
      `[finalize-session] generateSessionReport failed for sessionId=${sessionId}`,
      e,
    );
    return { ok: false, error: 'report_generation_failed', retryable: true, status: 503 };
  }

  const report = {
    heatmap_data,
    summary_text: summary.summary_text,
    generated_at: new Date().toISOString(),
  };

  // session_report upsert + interview_session status='completed'
  try {
    await db
      .insert(schema.sessionReport)
      .values({
        session_id: sessionId,
        heatmap_data: report.heatmap_data,
        summary_text: report.summary_text,
        generated_at: new Date(report.generated_at),
      })
      .onConflictDoUpdate({
        target: schema.sessionReport.session_id,
        set: {
          heatmap_data: report.heatmap_data,
          summary_text: report.summary_text,
          generated_at: new Date(report.generated_at),
        },
      });

    await db
      .update(schema.interviewSession)
      .set({ status: 'completed', completed_at: new Date() })
      .where(eq(schema.interviewSession.id, sessionId));
  } catch (e) {
    console.error(
      `[finalize-session] DB update failed for sessionId=${sessionId}`,
      e,
    );
    return { ok: false, error: 'db_update_failed', retryable: true, status: 503 };
  }

  return {
    ok: true,
    redirect: '/interviews/' + sessionId + '/report',
  };
}

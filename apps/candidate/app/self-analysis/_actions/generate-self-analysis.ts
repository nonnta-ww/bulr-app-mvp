'use server';

/**
 * generateSelfAnalysis — 自己分析の生成 Server Action
 * regenerateNarrative — 自然言語部分の再生成 Server Action
 *
 * generateSelfAnalysis authedAction フロー（design.md §自己分析の生成（版スコープ）厳守）:
 *   1. requireCandidate — 未認証は AuthError として authedAction が捕捉し ok:false を返す
 *   2. getLatestSurveyResponseForAnalysis(input.surveyId) — 指定 survey の最新版 response を解決
 *      （null なら NO_RESPONSE。本人フィルタ込みで所有者確認も兼ねる）
 *   4. checkRegenerationAllowed(sourceResponseId) — 版スコープの日次上限超過なら RATE_LIMITED を返す
 *   5. aggregate — 決定論的集計で AggregatedSnapshot を算出
 *   6. generateSelfAnalysisNarrative — try/catch で LLM 生成を試みる
 *      - 成功: estimateUsd でコスト算出、llmOutput/metadata を含めて upsert → status 'complete'
 *      - 失敗: llmOutput=null/metadata=null で upsert → status 'viz_only'
 *   7. upsertSelfAnalysis（onConflict target = source_response_id）
 *   8. revalidatePath('/self-analysis')
 *
 * regenerateNarrative authedAction フロー（design.md §System Flows 末尾・集計不変）:
 *   1. requireCandidate
 *   2. getSelfAnalysis(input.surveyId) — 指定 survey の最新版の保存済み分析。無ければ NO_ANALYSIS
 *   4. checkRegenerationAllowed(existing.sourceResponseId) — 版スコープ判定。上限超過なら RATE_LIMITED
 *   5. getSurveyResponseByResponseId(existing.sourceResponseId) — 同一版の回答を取得（版固定）
 *   6. generateSelfAnalysisNarrative(aggregated=保存済みスナップショット) — try/catch
 *      - 成功: estimateUsd でコスト算出、updateNarrative → incrementRegenerationCount → status 'complete'
 *      - 失敗: updateNarrative を呼ばず既存状態を保持 → { ok:false, error: GENERATION_FAILED }
 *   7. revalidatePath('/self-analysis')
 *
 * 再生成カウンタ反映（Req 3.5）:
 *   updateNarrative（llm_output / metadata / updated_at）の直後に
 *   incrementRegenerationCount を呼び出し、regeneration_count / regeneration_window_start を
 *   verdict.nextCount / verdict.windowStart に進める。
 *   これにより checkRegenerationAllowed が次回呼び出し時に更新済みカウントを参照し、
 *   日次上限（SELF_ANALYSIS_DAILY_REGEN_LIMIT）が正しく機能する。
 *
 * ビジネスエラー（NO_RESPONSE/NO_ANALYSIS/RATE_LIMITED/GENERATION_FAILED）は ActionError の
 * throw で表現し、candidateAction が単層 { ok:false, error } に畳む。consumer は result.ok の
 * 1 段階で読む（成功時は result.data.status）。
 *
 * RATE_LIMITED は版スコープ（10/24h）として機能し、30日クールダウン（再回答抑止）とは独立した
 * 日次上限である。checkRegenerationAllowed は sourceResponseId 単位で判定する。
 *
 * Requirements: 3.1, 3.2, 3.5
 * Boundary: generate-self-analysis action
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { candidateAction, ActionError } from '@bulr/auth/server';
import {
  getLatestSurveyResponseForAnalysis,
  getSurveyResponseByResponseId,
  getSelfAnalysis,
  checkRegenerationAllowed,
  upsertSelfAnalysis,
  updateNarrative,
  incrementRegenerationCount,
} from '@bulr/db';
import type { SelfAnalysisMetadata } from '@bulr/db';

import { generateSelfAnalysisNarrative } from '@bulr/ai-self-analysis';

import { aggregate } from '../_lib/aggregate';
import { estimateUsd } from '../_lib/cost';

// ---------------------------------------------------------------------------
// 入力スキーマ（対象 survey は呼び出し元の詳細ページが surveyId で指定する）
// ---------------------------------------------------------------------------

const generateSelfAnalysisSchema = z.object({ surveyId: z.string().min(1) });

// ---------------------------------------------------------------------------
// 戻り値型（handler レベルの discriminated union）
// ---------------------------------------------------------------------------

type GenerateSelfAnalysisResult = { status: 'complete' | 'viz_only' };

// ---------------------------------------------------------------------------
// generateSelfAnalysis — 自己分析の生成 Server Action
// ---------------------------------------------------------------------------

/**
 * 候補者の最新 skill-survey 回答から自己分析を生成・永続化する。
 * 最新回答版（responseId）を先に解決してから版スコープで rate-limit を判定する。
 * upsert の onConflict target は source_response_id のため、同一版への再生成は版数を増やさず行を更新する。
 *
 * consumer は次のとおり 1 段階で読む:
 *   - result.ok === false → auth/Zod/ビジネスエラー（result.error.code / result.error.message）
 *   - result.ok === true  → result.data.status が 'complete' | 'viz_only'
 */
export const generateSelfAnalysis = candidateAction(
  generateSelfAnalysisSchema,
  async (input, { candidateProfile }): Promise<GenerateSelfAnalysisResult> => {
    const { surveyId } = input;

    // 2. 指定 survey の最新版 response を解決（未回答 or 他者の survey なら NO_RESPONSE）
    //    getLatestSurveyResponseForAnalysis は candidateProfileId で本人フィルタ済み（所有者確認も兼ねる）
    const source = await getLatestSurveyResponseForAnalysis(candidateProfile.id, surveyId);
    if (!source) {
      throw new ActionError(
        'NO_RESPONSE',
        'このアンケートにまだ回答していません。先にアンケートに回答してください。',
      );
    }

    // 4. 版スコープの日次再生成抑制カウンタ判定（上限超過なら RATE_LIMITED）
    // NOTE: checkRegenerationAllowed は sourceResponseId 単位で判定し、30日クールダウンとは独立した日次上限として機能する
    const verdict = await checkRegenerationAllowed(candidateProfile.id, source.responseId);
    if (!verdict.allowed) {
      throw new ActionError(
        'RATE_LIMITED',
        '本日の再生成上限に達しました。時間をおいてから再度お試しください。',
      );
    }

    // 5. 決定論的集計（純関数 — 副作用なし、同一入力→同一出力）
    const aggregatedSnapshot = aggregate(source);

    // 6. LLM 生成（try/catch で失敗を捕捉し viz_only へ degradation）
    // answers を generateSelfAnalysisNarrative の期待する形 { categoryName, questionBody, selectedLabels, freeText } に整形
    const answers = source.categories.flatMap((category) =>
      category.answers.map((answer) => ({
        categoryName: answer.categoryName,
        questionBody: answer.questionBody,
        selectedLabels: answer.selectedLabels,
        freeText: answer.freeText,
      })),
    );

    let status: 'complete' | 'viz_only' = 'viz_only';
    let llmOutputForUpsert: Parameters<typeof upsertSelfAnalysis>[0]['llmOutput'] = null;
    let metadataForUpsert: SelfAnalysisMetadata | null = null;

    try {
      const llmResult = await generateSelfAnalysisNarrative({
        jobType: source.jobType,
        aggregated: aggregatedSnapshot,
        answers,
      });

      // コスト算出
      const estimatedUsd = estimateUsd(llmResult.usage);
      metadataForUpsert = {
        llm_cost_estimate: {
          input_tokens: llmResult.usage.input_tokens,
          output_tokens: llmResult.usage.output_tokens,
          estimated_usd: estimatedUsd,
        },
      };

      llmOutputForUpsert = llmResult.output;
      status = 'complete';
    } catch {
      // LLM 生成失敗 — 決定論集計結果（aggregatedSnapshot）は保持し viz_only で保存
      // llmOutput=null / metadata=null で upsert する（Req 3.2）
      llmOutputForUpsert = null;
      metadataForUpsert = null;
      status = 'viz_only';
    }

    // 7. upsert（成功・失敗どちらのケースも aggregatedSnapshot は必ず永続化）
    // onConflict target = source_response_id → 同一版への upsert は版数を増やさず行を更新する
    await upsertSelfAnalysis({
      candidateProfileId: candidateProfile.id,
      skillSurveyId: surveyId,
      sourceResponseId: source.responseId,
      sourceSubmittedAt: source.submittedAt,
      aggregatedSnapshot,
      llmOutput: llmOutputForUpsert,
      metadata: metadataForUpsert,
      regenerationCount: verdict.nextCount,
      regenerationWindowStart: verdict.windowStart,
    });

    // 8. /self-analysis（一覧）と詳細を revalidate（再訪時に最新状態を表示するため）
    revalidatePath('/self-analysis');
    revalidatePath(`/self-analysis/${surveyId}`);

    return { status };
  },
);

// ---------------------------------------------------------------------------
// 入力スキーマ（regenerateNarrative — 入力不要）
// ---------------------------------------------------------------------------

const regenerateNarrativeSchema = z.object({ surveyId: z.string().min(1) });

// ---------------------------------------------------------------------------
// 戻り値型（regenerateNarrative handler レベルの discriminated union）
// ---------------------------------------------------------------------------

type RegenerateNarrativeResult = { status: 'complete' };

// ---------------------------------------------------------------------------
// regenerateNarrative — 自然言語部分のみ再生成する Server Action
// ---------------------------------------------------------------------------

/**
 * 保存済み self_analysis の aggregated_snapshot を入力に LLM のみ再実行し、
 * llm_output / metadata を更新する（Req 3.2, 3.5）。
 * 決定論的集計（aggregated_snapshot / source_submitted_at）は変更しない（invariant）。
 *
 * 再生成は最新版の分析（getSelfAnalysis）の sourceResponseId の回答を版固定で取得し、
 * その版の行のみを更新する（新しい版を追加しない）。
 *
 * consumer は次のとおり 1 段階で読む:
 *   - result.ok === false → auth/Zod/ビジネスエラー（result.error.code / result.error.message）
 *   - result.ok === true  → result.data.status === 'complete'
 */
export const regenerateNarrative = candidateAction(
  regenerateNarrativeSchema,
  async (input, { candidateProfile }): Promise<RegenerateNarrativeResult> => {
    const { surveyId } = input;

    // 2. 指定 survey の最新版の保存済み自己分析を取得（無ければ再生成対象が無い）
    const existing = await getSelfAnalysis(candidateProfile.id, surveyId);
    if (!existing) {
      throw new ActionError(
        'NO_ANALYSIS',
        '再生成対象の自己分析が見つかりません。先に自己分析を生成してください。',
      );
    }

    // 4. 版スコープの日次再生成抑制カウンタ判定（上限超過なら RATE_LIMITED）
    // NOTE: existing.sourceResponseId で版スコープの判定を行う（30日クールダウンとは独立した日次上限）
    const verdict = await checkRegenerationAllowed(candidateProfile.id, existing.sourceResponseId);
    if (!verdict.allowed) {
      throw new ActionError(
        'RATE_LIMITED',
        '本日の再生成上限に達しました。時間をおいてから再度お試しください。',
      );
    }

    // 5. 既存分析と同一版の回答を版固定で取得（最新 response ではなく existing の版を使う — 集計不変の invariant）
    // 理論上 null にはならないが防御的に扱う（null の場合はシステムエラーとして再 throw）
    const source = await getSurveyResponseByResponseId(
      candidateProfile.id,
      existing.sourceResponseId,
    );
    if (!source) {
      throw new Error(
        `getSurveyResponseByResponseId returned null for candidateProfileId=${candidateProfile.id} sourceResponseId=${existing.sourceResponseId}`,
      );
    }

    // answers を generateSelfAnalysisNarrative の期待する形に整形
    const answers = source.categories.flatMap((category) =>
      category.answers.map((answer) => ({
        categoryName: answer.categoryName,
        questionBody: answer.questionBody,
        selectedLabels: answer.selectedLabels,
        freeText: answer.freeText,
      })),
    );

    // 6. LLM 生成（集計は再実行しない — 保存済み aggregatedSnapshot を使用）
    let llmMetadata: SelfAnalysisMetadata;
    try {
      const llmResult = await generateSelfAnalysisNarrative({
        jobType: source.jobType,
        // 保存済みスナップショットをそのまま渡す（Req 3.2: 集計は不変）
        aggregated: existing.aggregatedSnapshot,
        answers,
      });

      // コスト算出
      const estimatedUsd = estimateUsd(llmResult.usage);
      llmMetadata = {
        llm_cost_estimate: {
          input_tokens: llmResult.usage.input_tokens,
          output_tokens: llmResult.usage.output_tokens,
          estimated_usd: estimatedUsd,
        },
      };

      // narrative のみ更新（aggregated_snapshot / source_submitted_at は変更しない）
      await updateNarrative(existing.id, llmResult.output, llmMetadata);

      // 再生成カウンタを進める（Req 3.5 — 日次上限が正しく機能するよう DB に反映）
      //    verdict.allowed === true が保証されているため nextCount / windowStart は型安全に参照可能
      await incrementRegenerationCount(existing.id, verdict.nextCount, verdict.windowStart);
    } catch {
      // LLM 生成失敗 — updateNarrative を呼ばず既存状態を保持（Req 3.2）
      throw new ActionError(
        'GENERATION_FAILED',
        '自然言語サマリの再生成に失敗しました。しばらくしてからもう一度お試しください。',
      );
    }

    // /self-analysis（一覧）と詳細を revalidate（再訪時に最新状態を表示するため）
    revalidatePath('/self-analysis');
    revalidatePath(`/self-analysis/${surveyId}`);

    return { status: 'complete' };
  },
);

'use server';

/**
 * generateSelfAnalysis — 自己分析の生成 Server Action
 *
 * authedAction でラップし、以下のフローを順に実行する（design.md §生成フロー厳守）:
 *   1. requireCandidate — 未認証は AuthError として authedAction が捕捉し ok:false を返す
 *   2. getAnsweredSurveyForCandidate — 未回答なら NO_RESPONSE を返す
 *   3. checkRegenerationAllowed — 日次上限超過なら RATE_LIMITED を返す
 *   4. getSurveyResponseForAnalysis — 回答＋カテゴリ名＋選択肢ラベルを取得
 *   5. aggregate — 決定論的集計で AggregatedSnapshot を算出
 *   6. generateSelfAnalysisNarrative — try/catch で LLM 生成を試みる
 *      - 成功: estimateUsd でコスト算出、llmOutput/metadata を含めて upsert → status 'complete'
 *      - 失敗: llmOutput=null/metadata=null で upsert → status 'viz_only'
 *   7. revalidatePath('/self-analysis')
 *
 * ビジネスエラー（NO_RESPONSE/RATE_LIMITED）は handler 戻り値の discriminated 形で表現し、
 * consumer は result.ok（authedAction 層）→ result.data（ビジネス層）の2段階で読む。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 4.1, 4.2, 6.1, 7.1, 9.1, 9.3
 * Boundary: generate-self-analysis action
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authedAction, requireCandidate } from '@bulr/auth/server';
import {
  getAnsweredSurveyForCandidate,
  getSurveyResponseForAnalysis,
  checkRegenerationAllowed,
  upsertSelfAnalysis,
} from '@bulr/db';
import type { SelfAnalysisMetadata } from '@bulr/db';

import { generateSelfAnalysisNarrative } from '@bulr/ai-self-analysis';

import { aggregate } from '../_lib/aggregate';
import { estimateUsd } from '../_lib/cost';

// ---------------------------------------------------------------------------
// 入力スキーマ（入力不要：対象 survey は getAnsweredSurveyForCandidate で特定）
// ---------------------------------------------------------------------------

const generateSelfAnalysisSchema = z.object({});

// ---------------------------------------------------------------------------
// 戻り値型（handler レベルの discriminated union）
// ---------------------------------------------------------------------------

type GenerateSelfAnalysisResult =
  | { ok: true; status: 'complete' | 'viz_only' }
  | { ok: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// generateSelfAnalysis — 自己分析の生成 Server Action
// ---------------------------------------------------------------------------

/**
 * 候補者の最新 skill-survey 回答から自己分析を生成・永続化する。
 *
 * consumer は次の順で戻り値を読む:
 *   1. result.ok === false → auth/Zod エラー（result.error.code / result.error.message）
 *   2. result.ok === true && result.data.ok === false → ビジネスエラー（NO_RESPONSE / RATE_LIMITED）
 *   3. result.ok === true && result.data.ok === true → result.data.status が 'complete' | 'viz_only'
 */
export const generateSelfAnalysis = authedAction(
  generateSelfAnalysisSchema,
  async (_input, _ctx): Promise<GenerateSelfAnalysisResult> => {
    // 1. requireCandidate — 未認証・プロフィール未作成は AuthError として伝播
    const { candidateProfile } = await requireCandidate();

    // 2. 候補者の回答済み survey を特定（未回答なら NO_RESPONSE）
    const surveySummary = await getAnsweredSurveyForCandidate(candidateProfile.id);
    if (!surveySummary) {
      return {
        ok: false,
        error: {
          code: 'NO_RESPONSE',
          message: 'skill-survey にまだ回答していません。先に skill-survey に回答してください。',
        },
      };
    }

    const { surveyId } = surveySummary;

    // 3. 日次再生成抑制カウンタ判定（上限超過なら RATE_LIMITED）
    const verdict = await checkRegenerationAllowed(candidateProfile.id, surveyId);
    if (!verdict.allowed) {
      return {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: '本日の再生成上限に達しました。時間をおいてから再度お試しください。',
        },
      };
    }

    // 4. 回答＋カテゴリ名＋選択肢ラベルを取得
    // 理論上 null にはならないが防御的に扱う（null の場合はシステムエラーとして再 throw）
    const source = await getSurveyResponseForAnalysis(candidateProfile.id, surveyId);
    if (!source) {
      throw new Error(
        `getSurveyResponseForAnalysis returned null for candidateProfileId=${candidateProfile.id} surveyId=${surveyId}`,
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
      // llmOutput=null / metadata=null で upsert する（Req 4.1）
      llmOutputForUpsert = null;
      metadataForUpsert = null;
      status = 'viz_only';
    }

    // upsert（成功・失敗どちらのケースも aggregatedSnapshot は必ず永続化）
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

    // /self-analysis を revalidate（再訪時に最新状態を表示するため）
    revalidatePath('/self-analysis');

    return { ok: true, status };
  },
);

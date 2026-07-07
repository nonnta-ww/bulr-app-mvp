'use server';

/**
 * generateClassDiagnosis — RPG クラス診断の生成 Server Action（task 7）。
 *
 * candidateAction フロー（design.md §生成フロー / Error Handling 厳守）:
 *   1. requireCandidate — 未認証は AuthError として candidateAction が捕捉し ok:false を返す
 *   2. getCandidateVocationSource — 候補者の kind='skill' 職掌ソースを横断取得
 *      - surveys が空（スキル未回答）→ NO_VOCATION（R8.1）
 *   3. getCandidatePlaystyleResponse — 気質回答（null 可 → partial 診断, R8.2）
 *   4. buildSourceSignature → checkClassRegenerationAllowed — 版スコープの日次上限判定
 *      - 上限超過 → RATE_LIMITED（R6.4）
 *   5. computeClassResult — 決定論的判定（foldVocations→scoreTemperament→resolveTitle→assembleClass）
 *      - playstyle 未回答なら temperament=null の partial（R8.2/8.3/12.2）
 *   6. generateClassFlavor — try/catch で LLM 生成を試みる（R7.3）
 *      - 成功: estimateUsd でコスト算出、llmFlavor/metadata を含めて upsert
 *      - 失敗: llmFlavor=null / metadata=null（クラス判定・可視化は保存される）
 *   7. upsertClassDiagnosis（版キー = source_signature。同一署名の再診断はカウンタを進める, R6.3/6.4）
 *   8. revalidatePath('/class-diagnosis')
 *
 * ビジネスエラー（NO_VOCATION/RATE_LIMITED）は ActionError の throw で表現し、candidateAction が
 * 単層 { ok:false, error } に畳む。consumer は result.ok の 1 段階で読む（self-analysis と同一）。
 *
 * Requirements: 1.1, 6.3, 6.4, 7.3, 8.1, 8.2, 8.3, 11.1, 11.2, 12.2
 * Boundary: generate-class-diagnosis action
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { candidateAction, ActionError } from '@bulr/auth/server';
import {
  getCandidateVocationSource,
  getCandidatePlaystyleResponse,
  checkClassRegenerationAllowed,
  upsertClassDiagnosis,
} from '@bulr/db';
import type { ClassDiagnosisMetadata } from '@bulr/types';

import { generateClassFlavor } from '@bulr/ai-class-diagnosis';

import {
  buildSourceSignature,
  buildSourceSnapshot,
  buildFlavorAnswers,
  computeClassResult,
} from '../_lib/build-diagnosis';
import { estimateUsd } from '../../self-analysis/_lib/cost';

// ---------------------------------------------------------------------------
// 入力スキーマ（入力不要 — 対象は認証済み候補者の全 skill/playstyle 回答）
// ---------------------------------------------------------------------------

const generateClassDiagnosisSchema = z.object({});

// ---------------------------------------------------------------------------
// 戻り値型（handler レベルの discriminated union）
// ---------------------------------------------------------------------------

type GenerateClassDiagnosisResult = {
  status: 'complete' | 'partial_no_temperament';
};

// ---------------------------------------------------------------------------
// generateClassDiagnosis — RPG クラス診断の生成 Server Action
// ---------------------------------------------------------------------------

/**
 * 候補者の skill 回答（職掌）+ playstyle 回答（気質）から RPG クラス診断を生成・永続化する。
 * 版キーは source_signature（寄与 response の署名）。同一署名の再診断は既存版を更新しつつ
 * 再生成カウンタを進める（R6.3/6.4）。LLM フレーバー生成失敗時もクラス判定・可視化は保存する（R7.3）。
 *
 * consumer は次のとおり 1 段階で読む:
 *   - result.ok === false → auth/Zod/ビジネスエラー（result.error.code / result.error.message）
 *   - result.ok === true  → result.data.status（'complete' | 'partial_no_temperament'）
 */
export const generateClassDiagnosis = candidateAction(
  generateClassDiagnosisSchema,
  async (_input, { candidateProfile }): Promise<GenerateClassDiagnosisResult> => {
    // 2. 職掌ソース（kind='skill' 横断）。スキル未回答なら NO_VOCATION（R8.1）。
    const source = await getCandidateVocationSource(candidateProfile.id);
    if (source.surveys.length === 0) {
      throw new ActionError(
        'NO_VOCATION',
        'スキル診断にまだ回答していません。先にスキルアンケートに回答してください。',
      );
    }

    // 3. 気質回答（null 可 → temperament=null の partial 診断, R8.2）。
    const playstyle = await getCandidatePlaystyleResponse(candidateProfile.id);

    // 4. 版署名 → 版スコープの日次再生成上限判定（上限超過なら RATE_LIMITED, R6.4）。
    const sourceSignature = buildSourceSignature(source, playstyle?.responseId ?? null);
    const verdict = await checkClassRegenerationAllowed(candidateProfile.id, sourceSignature);
    if (!verdict.allowed) {
      throw new ActionError(
        'RATE_LIMITED',
        '本日の再診断上限に達しました。時間をおいて再度お試しください。',
      );
    }

    // 5. 決定論的クラス判定（純関数 — 副作用なし, R1.1/8.2/8.3/12.2）。
    const result = computeClassResult(source, playstyle);

    // 6. LLM フレーバー生成（try/catch で失敗を捕捉し llmFlavor=null に degradation, R7.3）。
    let llmFlavor: Parameters<typeof upsertClassDiagnosis>[0]['llmFlavor'] = null;
    let metadata: ClassDiagnosisMetadata | null = null;
    try {
      const flavor = await generateClassFlavor({
        result,
        answers: buildFlavorAnswers(playstyle),
      });
      llmFlavor = flavor.output;
      metadata = {
        llm_cost_estimate: {
          input_tokens: flavor.usage.input_tokens,
          output_tokens: flavor.usage.output_tokens,
          estimated_usd: estimateUsd(flavor.usage),
        },
      };
    } catch {
      // LLM 生成失敗 — クラス判定（result）と可視化は保存し、フレーバーのみ null（R7.3）。
      llmFlavor = null;
      metadata = null;
    }

    // 7. upsert（版キー = source_signature。再診断はカウンタを進める, R6.3/6.4）。
    await upsertClassDiagnosis({
      candidateProfileId: candidateProfile.id,
      sourceSignature,
      sourceSnapshot: buildSourceSnapshot(source, playstyle),
      result,
      llmFlavor,
      metadata,
      regenerationCount: verdict.nextCount,
      regenerationWindowStart: verdict.windowStart,
    });

    // 8. 診断ページを revalidate（再訪時に最新状態を表示するため）。
    revalidatePath('/class-diagnosis');

    return {
      status: result.temperament ? 'complete' : 'partial_no_temperament',
    };
  },
);

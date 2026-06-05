'use server';

/**
 * submitSurvey — スキルアンケート送信 Server Action
 *
 * - authedAction でラップし、candidateProfile は requireCandidate() で取得する。
 * - selectedChoiceIds が指定された場合は skill_survey_choice テーブルで実在確認。
 * - DB トランザクション内で:
 *   1. skill_survey_response を upsert
 *   2. 既存 skill_survey_answer を DELETE
 *   3. 新規 skill_survey_answer を INSERT
 * - 成功後 redirect('/skill-survey/{surveyId}/result')
 *
 * Requirements: 4.4, 4.5, 4.6, 4.7, 7.2, 7.3, 7.4
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { inArray, eq, and } from 'drizzle-orm';

import { authedAction } from '@bulr/auth/server';
import { requireCandidate } from '@bulr/auth/server';
import { db } from '@bulr/db';
import {
  skillSurveyResponse,
  skillSurveyAnswer,
  skillSurveyChoice,
  skillSurveyQuestion,
  skillSurveyCategory,
} from '@bulr/db/schema';

// --- Zod スキーマ ---

const submitSurveySchema = z.object({
  surveyId: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedChoiceIds: z.array(z.string()).optional(),
      freeText: z.string().max(2000).optional(),
    }),
  ),
});

// --- Server Action ---

export const submitSurvey = authedAction(
  submitSurveySchema,
  async ({ surveyId, answers }, _ctx) => {
    // candidateProfile を requireCandidate() で取得する
    const { candidateProfile } = await requireCandidate();

    // --- selectedChoiceIds のサーバーサイド実在確認 ---

    const allRequestedChoiceIds = answers.flatMap(
      (a) => a.selectedChoiceIds ?? [],
    );

    if (allRequestedChoiceIds.length > 0) {
      const existingChoices = await db
        .select({ id: skillSurveyChoice.id })
        .from(skillSurveyChoice)
        .where(inArray(skillSurveyChoice.id, allRequestedChoiceIds));

      const existingIds = new Set(existingChoices.map((c) => c.id));
      const missingIds = allRequestedChoiceIds.filter((id) => !existingIds.has(id));

      if (missingIds.length > 0) {
        return {
          ok: false as const,
          error: {
            code: 'INVALID_CHOICE_IDS',
            message: '無効な選択肢IDが含まれています。ページを再読み込みして再度お試しください。',
          },
        };
      }
    }

    // --- サーバ側必須設問検証 (要件 9.6, 12.1) ---
    // クライアント送信を信頼せず DB から is_required=true の設問を取得して再検証する

    const requiredQuestions = await db
      .select({
        id: skillSurveyQuestion.id,
        questionType: skillSurveyQuestion.questionType,
      })
      .from(skillSurveyQuestion)
      .innerJoin(skillSurveyCategory, eq(skillSurveyQuestion.categoryId, skillSurveyCategory.id))
      .where(
        and(
          eq(skillSurveyCategory.skillSurveyId, surveyId),
          eq(skillSurveyQuestion.isRequired, true),
        ),
      );

    const unsatisfiedRequiredIds: string[] = [];

    for (const q of requiredQuestions) {
      const payloadAnswer = answers.find((a) => a.questionId === q.id);

      let satisfied = false;
      if (payloadAnswer) {
        if (q.questionType === 'free_text') {
          // free_text: 空白以外の文字列が入力されていること
          satisfied = typeof payloadAnswer.freeText === 'string' && payloadAnswer.freeText.trim().length > 0;
        } else {
          // single_choice / multi_choice: 少なくとも 1 件の選択肢が選択されていること
          satisfied = Array.isArray(payloadAnswer.selectedChoiceIds) && payloadAnswer.selectedChoiceIds.length > 0;
        }
      }

      if (!satisfied) {
        unsatisfiedRequiredIds.push(q.id);
      }
    }

    if (unsatisfiedRequiredIds.length > 0) {
      return {
        ok: false as const,
        error: {
          code: 'MISSING_REQUIRED_ANSWERS',
          message: '必須項目が未回答です。すべての必須設問にご回答のうえ、再度送信してください。',
        },
      };
    }

    // --- DB トランザクション ---

    await db.transaction(async (tx) => {
      const now = new Date();

      // Step 1: skill_survey_response を upsert し、response.id を取得
      const upsertResult = await tx
        .insert(skillSurveyResponse)
        .values({
          candidateProfileId: candidateProfile.id,
          skillSurveyId: surveyId,
          submittedAt: now,
        })
        .onConflictDoUpdate({
          target: [skillSurveyResponse.candidateProfileId, skillSurveyResponse.skillSurveyId],
          set: {
            submittedAt: now,
            updatedAt: now,
          },
        })
        .returning({ id: skillSurveyResponse.id });

      const responseId = upsertResult[0]?.id;
      if (!responseId) {
        throw new Error('skill_survey_response の upsert に失敗しました。');
      }

      // Step 2: 既存 skill_survey_answer を DELETE
      await tx
        .delete(skillSurveyAnswer)
        .where(eq(skillSurveyAnswer.responseId, responseId));

      // Step 3: 新規 skill_survey_answer を全設問分 INSERT（回答が空でも挿入する）
      if (answers.length > 0) {
        await tx.insert(skillSurveyAnswer).values(
          answers.map((a) => ({
            responseId,
            questionId: a.questionId,
            selectedChoiceIds:
              a.selectedChoiceIds && a.selectedChoiceIds.length > 0
                ? a.selectedChoiceIds
                : null,
            freeText: a.freeText ?? null,
          })),
        );
      }
    });

    // 成功後: 結果ページへリダイレクト（redirect は内部的に throw するため transaction の外で呼ぶ）
    redirect(`/skill-survey/${surveyId}/result`);
  },
);

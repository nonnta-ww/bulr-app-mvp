'use server';

/**
 * submitSurvey — スキルアンケート送信 Server Action（stub）
 *
 * TODO(task-5.4): このスタブを実際の DB upsert ロジックに置き換える。
 *
 * 入力スキーマ（確定済み）:
 *   surveyId: string
 *   answers: Array<{ questionId: string; selectedChoiceIds?: string[]; freeText?: string }>
 *
 * 成功時: redirect('/skill-survey/{surveyId}/result')
 * 失敗時: { ok: false, error: { code, message } }
 *
 * Requirements: 4.4, 4.5, 4.7, 7.2, 7.3
 */

import { z } from 'zod';

import { authedAction } from '@bulr/auth/server';

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
  async (_input, _ctx): Promise<void> => {
    // TODO(task-5.4): DB upsert + redirect を実装する
  },
);

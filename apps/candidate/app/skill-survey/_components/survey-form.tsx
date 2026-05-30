'use client';

/**
 * スキルアンケート回答フォーム（Client Component）
 *
 * TODO(task-5.3): このスタブを実際のフォーム実装に置き換える。
 *
 * Props の型シグネチャは確定済み。task 5.3 では本コンポーネントの本体を実装すること。
 * - survey: アンケートマスタ
 * - categories: カテゴリ一覧（設問・選択肢を含む）
 * - existingResponse: 既存回答（再回答時のプリフィル）| null
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import type {
  SkillSurvey,
  SkillSurveyCategory,
  SkillSurveyQuestion,
  SkillSurveyChoice,
} from '@bulr/db/schema';
import type { SkillSurveyResponseWithAnswers } from '@bulr/db/queries';

// --- Types ---

export type QuestionWithChoices = SkillSurveyQuestion & {
  choices: SkillSurveyChoice[];
};

export type CategoryWithQuestions = SkillSurveyCategory & {
  questions: QuestionWithChoices[];
};

export interface SurveyFormProps {
  survey: SkillSurvey;
  categories: CategoryWithQuestions[];
  existingResponse: SkillSurveyResponseWithAnswers | null;
}

// --- Component ---

/**
 * @stub task 5.3 が本体を実装する
 */
export function SurveyForm({ survey, categories, existingResponse }: SurveyFormProps) {
  return (
    <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
      準備中
    </div>
  );
}

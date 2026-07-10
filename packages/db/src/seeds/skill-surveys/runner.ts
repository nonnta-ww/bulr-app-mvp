/**
 * スキルアンケート seed 共通ランナー
 *
 * 各職種の seed（backend / frontend / ai-driven-development / infrastructure-sre /
 * engineering-manager）は survey → category → question → choice の 4 段 upsert という
 * 同一構造を持つ。従来は各ファイルに約 100 行の同一ランナーがコピーされていたため、
 * スキーマ列の追加・onConflict 仕様変更のたびに 5 箇所を同期修正する必要があった。
 * このモジュールにランナーを一本化し、各 seed ファイルはデータ定義のみを持つ。
 *
 * 冪等性: onConflictDoUpdate による upsert（各行の id は初回生成後不変 = set に id を含めない）。
 */

import { sql } from 'drizzle-orm';

import type { DB } from '../../client';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyQuestion,
  skillSurveyChoice,
} from '../../schema/skill-survey';

export type SkillSurveySeedQuestion = {
  text: string;
  questionType: 'single_choice' | 'multi_choice' | 'free_text';
  displayOrder: number;
  isRequired?: boolean;
  // 全職種の union（各 seed 側はより狭い union で構わない）。
  // 'polarity' は playstyle（気質）診断用: level が第2極寄りの強さを表す。
  scoringKind?: 'proficiency' | 'recency' | 'frequency' | 'polarity';
  choices: Array<{ text: string; displayOrder: number; level?: number }>;
};

export type SkillSurveySeedData = {
  jobType: string;
  /**
   * survey の種別（既定: 'skill'）。playstyle 診断は 'playstyle'、
   * 思考スタイル診断は 'thinking_style'、働き方の志向診断は 'worklife_disposition' を指定する。
   * 初回 insert 時のみ設定し、onConflict の set には含めない（既存行の kind は不変）。
   */
  kind?: 'skill' | 'playstyle' | 'thinking_style' | 'worklife_disposition';
  title: string;
  categories: Array<{
    name: string;
    subcategory: string | null;
    displayOrder: number;
    questions: SkillSurveySeedQuestion[];
  }>;
};

export interface RunSkillSurveySeedOptions {
  /** ログ出力ラベル（既定: seed.jobType）。`[skill-survey/<label>]` で出力する。 */
  logLabel?: string;
  /**
   * 各設問の isRequired 解決関数（既定: `question.isRequired ?? false`）。
   * backend は本文一致の REQUIRED_QUESTION_BODIES による判定を注入して後方互換を保つ。
   */
  resolveIsRequired?: (question: SkillSurveySeedQuestion) => boolean;
}

/**
 * スキルアンケートの seed データを DB に投入する（idempotent）。
 *
 * survey → category → question → choice を onConflictDoUpdate で upsert する。
 */
export async function runSkillSurveySeed(
  db: DB,
  seed: SkillSurveySeedData,
  options: RunSkillSurveySeedOptions = {},
): Promise<void> {
  const logLabel = options.logLabel ?? seed.jobType;
  const resolveIsRequired =
    options.resolveIsRequired ?? ((question) => question.isRequired ?? false);

  await db.transaction(async (tx) => {
    // 1. survey をアップサート
    const [survey] = await tx
      .insert(skillSurvey)
      .values({
        jobType: seed.jobType,
        kind: seed.kind ?? 'skill',
        title: seed.title,
      })
      .onConflictDoUpdate({
        target: skillSurvey.jobType,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: skillSurvey.id });

    if (!survey) throw new Error('Failed to upsert skill_survey row');
    const surveyId = survey.id;

    let totalCategories = 0;
    let totalQuestions = 0;
    let totalChoices = 0;

    for (const category of seed.categories) {
      // 2. category をアップサート
      const [cat] = await tx
        .insert(skillSurveyCategory)
        .values({
          skillSurveyId: surveyId,
          name: category.name,
          subcategory: category.subcategory,
          displayOrder: category.displayOrder,
        })
        .onConflictDoUpdate({
          target: [
            skillSurveyCategory.skillSurveyId,
            skillSurveyCategory.name,
            skillSurveyCategory.subcategory,
          ],
          set: {
            displayOrder: sql`excluded.display_order`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: skillSurveyCategory.id });

      if (!cat) throw new Error(`Failed to upsert category: ${category.name} / ${category.subcategory}`);
      const categoryId = cat.id;
      totalCategories++;

      for (const question of category.questions) {
        // 3. question をアップサート
        const [q] = await tx
          .insert(skillSurveyQuestion)
          .values({
            categoryId,
            body: question.text,
            questionType: question.questionType,
            scoringKind: question.scoringKind ?? null,
            displayOrder: question.displayOrder,
            isRequired: resolveIsRequired(question),
          })
          .onConflictDoUpdate({
            target: [skillSurveyQuestion.categoryId, skillSurveyQuestion.body],
            set: {
              questionType: sql`excluded.question_type`,
              scoringKind: sql`excluded.scoring_kind`,
              displayOrder: sql`excluded.display_order`,
              isRequired: sql`excluded.is_required`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: skillSurveyQuestion.id });

        if (!q) throw new Error(`Failed to upsert question: ${question.text}`);
        const questionId = q.id;
        totalQuestions++;

        for (const choice of question.choices) {
          // 4. choice をアップサート
          await tx
            .insert(skillSurveyChoice)
            .values({
              questionId,
              label: choice.text,
              level: choice.level ?? null,
              displayOrder: choice.displayOrder,
            })
            .onConflictDoUpdate({
              target: [skillSurveyChoice.questionId, skillSurveyChoice.label],
              set: {
                level: sql`excluded.level`,
                displayOrder: sql`excluded.display_order`,
              },
            });

          totalChoices++;
        }
      }
    }

    console.log(
      `[skill-survey/${logLabel}] categories: ${totalCategories}, questions: ${totalQuestions}, choices: ${totalChoices}`,
    );
  });
}

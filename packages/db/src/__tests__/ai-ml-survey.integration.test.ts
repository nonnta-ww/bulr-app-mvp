/**
 * sage-survey（jobType='ai-ml'）— seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/sage-survey, tasks 4.1）:
 *  1. survey 提供: jobType='ai-ml' が 1 件・isActive・期待 title (Req 1.1)
 *  2. カテゴリ構成: トップカテゴリ distinct=6 (Req 2.1)
 *  3. 必須設問: isRequired=true が各トップカテゴリに最低1件・計6件 (Req 6.1)
 *  4. proficiency: scoringKind='proficiency' の設問は level 0-3 を持ち、代表習熟度が対象4カテゴリに存在 (Req 4.3, 5.1)
 *  5. enum 健全性: 使う scoringKind は 'proficiency' のみ（recency/frequency 未使用）(Req 5.3)
 *  6. free_text: 分析・可視化カテゴリに free_text 設問が存在 (Req 3.4)
 *  7. ai-driven-development との非重複: コーディング支援ツール（Copilot 等）を選択肢に含めない (Req 2.3)
 *  8. 冪等: runAiMlSkillSurveySeed を再実行しても設問・選択肢が増えない (Req 9.2)
 *  9. 非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / ai-ml が共存 (Req 11.1, 11.3)
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する。スキーマは drizzle migrator で自己適用する
 *   （migrator journal 衝突を避けるためクリーン DB での実行を推奨）。
 */

import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq, inArray } from 'drizzle-orm';

import type { DB } from '../client';
import {
  skillSurvey,
  skillSurveyCategory,
  skillSurveyChoice,
  skillSurveyQuestion,
} from '../schema/skill-survey';
import { runAiMlSkillSurveySeed } from '../seeds/skill-surveys/ai-ml';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[ai-ml-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const EXPECTED_TOP_CATEGORIES = [
  '機械学習基礎',
  'モデル開発・評価',
  'データエンジニアリング',
  '推薦・検索',
  'MLOps',
  '分析・可視化',
];

// 代表習熟度ペアを持つカテゴリ（★）
const REP_PROFICIENCY_CATEGORIES = [
  '機械学習基礎',
  'モデル開発・評価',
  'データエンジニアリング',
  'MLOps',
];

let db: DB;

async function getAiMlSurveyId(): Promise<string> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'ai-ml'));
  if (!survey) throw new Error('ai-ml survey not found');
  return survey.id;
}

async function getQuestionIds(surveyId: string): Promise<string[]> {
  const cats = await db
    .select({ id: skillSurveyCategory.id })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
  const catIds = cats.map((c) => c.id);
  if (catIds.length === 0) return [];
  const qs = await db
    .select({ id: skillSurveyQuestion.id })
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, catIds));
  return qs.map((q) => q.id);
}

describeDb('ai-ml-survey（sage-survey）seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runAiMlSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用）。
  });

  it('jobType=ai-ml の survey が 1 件・isActive・期待 title である (Req 1.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'ai-ml'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.title).toBe('AI/ML・データ スキルアンケート');
  });

  it('トップカテゴリが6種である (Req 2.1)', async () => {
    const surveyId = await getAiMlSurveyId();
    const cats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const distinctNames = [...new Set(cats.map((c) => c.name))];
    expect(distinctNames).toHaveLength(6);
    expect(distinctNames.sort()).toEqual([...EXPECTED_TOP_CATEGORIES].sort());
  });

  it('必須設問が各トップカテゴリに最低1件・計6件である (Req 6.1)', async () => {
    const surveyId = await getAiMlSurveyId();
    const cats = await db
      .select({ id: skillSurveyCategory.id, name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const catIds = cats.map((c) => c.id);
    const allQs = await db
      .select({
        categoryId: skillSurveyQuestion.categoryId,
        isRequired: skillSurveyQuestion.isRequired,
      })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, catIds));
    const requiredCatIds = allQs.filter((q) => q.isRequired).map((q) => q.categoryId);
    expect(requiredCatIds).toHaveLength(6);

    const catIdToName = new Map(cats.map((c) => [c.id, c.name]));
    const requiredTopCategories = new Set(requiredCatIds.map((id) => catIdToName.get(id)));
    expect([...requiredTopCategories].sort()).toEqual([...EXPECTED_TOP_CATEGORIES].sort());
  });

  it('proficiency 設問は level 0-3 を持ち scoringKind は proficiency のみ、代表習熟度が4カテゴリに存在 (Req 4.3, 5.1, 5.3)', async () => {
    const surveyId = await getAiMlSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const profQs = await db
      .select({ id: skillSurveyQuestion.id, scoringKind: skillSurveyQuestion.scoringKind })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));

    const usedScoringKinds = new Set(
      profQs.map((q) => q.scoringKind).filter((k): k is NonNullable<typeof k> => k != null),
    );
    expect([...usedScoringKinds]).toEqual(['proficiency']);

    const profQIds = profQs.filter((q) => q.scoringKind === 'proficiency').map((q) => q.id);
    expect(profQIds.length).toBe(REP_PROFICIENCY_CATEGORIES.length);
    for (const qId of profQIds) {
      const cs = await db
        .select({ level: skillSurveyChoice.level })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, qId));
      expect(cs.map((c) => c.level).sort()).toEqual([0, 1, 2, 3]);
    }

    // 代表習熟度サブカテゴリが対象4カテゴリに存在する
    const repCats = await db
      .select({ name: skillSurveyCategory.name, subcategory: skillSurveyCategory.subcategory })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const hasRep = repCats.filter((c) => c.subcategory === '代表習熟度').map((c) => c.name);
    expect(hasRep.sort()).toEqual([...REP_PROFICIENCY_CATEGORIES].sort());
  });

  it('分析・可視化カテゴリに free_text 設問が存在する (Req 3.4)', async () => {
    const surveyId = await getAiMlSurveyId();
    const cats = await db
      .select({ id: skillSurveyCategory.id, name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const analysisCatIds = cats.filter((c) => c.name === '分析・可視化').map((c) => c.id);
    const qs = await db
      .select({ questionType: skillSurveyQuestion.questionType })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, analysisCatIds));
    expect(qs.some((q) => q.questionType === 'free_text')).toBe(true);
  });

  it('ai-driven-development と重複するコーディング支援ツールを選択肢に含めない (Req 2.3)', async () => {
    const surveyId = await getAiMlSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const labels = await db
      .select({ label: skillSurveyChoice.label })
      .from(skillSurveyChoice)
      .where(inArray(skillSurveyChoice.questionId, qIds));
    const haystack = labels.map((l) => l.label).join('\n');
    for (const term of ['Copilot', 'Cursor', 'Cline', 'Windsurf']) {
      expect(haystack).not.toContain(term);
    }
  });

  it('seed 再実行で設問・選択肢の総数が増えない（冪等）(Req 9.2)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runAiMlSkillSurveySeed(db);
    await runAiMlSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });

  it('非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / ai-ml が共存する (Req 11.1, 11.3)', async () => {
    const { runBackendSkillSurveySeed } = await import('../seeds/skill-surveys/backend');
    const { runAiDrivenDevelopmentSkillSurveySeed } = await import(
      '../seeds/skill-surveys/ai-driven-development'
    );
    const { runFrontendSkillSurveySeed } = await import('../seeds/skill-surveys/frontend');
    const { runInfrastructureSreSkillSurveySeed } = await import(
      '../seeds/skill-surveys/infrastructure-sre'
    );
    const { runEngineeringManagerSkillSurveySeed } = await import(
      '../seeds/skill-surveys/engineering-manager'
    );
    await runBackendSkillSurveySeed(db);
    await runAiDrivenDevelopmentSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);
    await runInfrastructureSreSkillSurveySeed(db);
    await runEngineeringManagerSkillSurveySeed(db);
    await runAiMlSkillSurveySeed(db);

    const expected = [
      'ai-driven-development',
      'ai-ml',
      'backend',
      'engineering-manager',
      'frontend',
      'infrastructure-sre',
    ];
    const surveys = await db
      .select({ jobType: skillSurvey.jobType })
      .from(skillSurvey)
      .where(inArray(skillSurvey.jobType, expected));
    expect(surveys.map((s) => s.jobType).sort()).toEqual([...expected].sort());
  });
});

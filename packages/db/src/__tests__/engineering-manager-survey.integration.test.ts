/**
 * engineering-manager-survey — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/engineering-manager-survey, tasks 4.1 / design Testing Strategy）:
 *  1. 冪等: runEngineeringManagerSkillSurveySeed を再実行しても設問・選択肢が増えない (Req 9.2)
 *  2. survey 提供: jobType='engineering-manager' が 1 件・isActive・期待 title (Req 1.1)
 *  3. カテゴリ構成: コンピテンシー 10 カテゴリが存在し、プロフィールが displayOrder 先頭 (Req 2.1)
 *  4. コンピテンシー別習熟度: 各コンピテンシーに breadth multi_choice と proficiency single_choice が
 *     共存し、proficiency 設問は計 10・選択肢 level 0-3 (Req 4.1, 4.3, 5.1)
 *  5. 必須設問: isRequired=true が各コンピテンシーに最低1件・計10件、プロフィールは必須でない (Req 6.1)
 *  6. enum 健全性: 使う scoringKind は 'proficiency' のみ（recency/frequency 未使用）(Req 5.3)
 *  7. 自由記述: free_text 設問が存在し、いずれも isRequired=false (Req 3.4)
 *  8. 非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager 共存 (Req 10.1-10.3)
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
import { runEngineeringManagerSkillSurveySeed } from '../seeds/skill-surveys/engineering-manager';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[engineering-manager-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const PROFILE_CATEGORY = 'マネジメント経験プロフィール';

const EXPECTED_COMPETENCIES = [
  'ピープルマネジメント',
  '採用・チーム組成',
  '育成・キャリア支援',
  'パフォーマンスマネジメント',
  'デリバリーマネジメント',
  '技術リーダーシップ',
  'ステークホルダー・コミュニケーション',
  '戦略・組織運営',
  'チーム文化・エンゲージメント',
  'プロセス・オペレーショナルエクセレンス',
];

let db: DB;

async function getEmSurveyId(): Promise<string> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'engineering-manager'));
  if (!survey) throw new Error('engineering-manager survey not found');
  return survey.id;
}

async function getCategories(surveyId: string) {
  return db
    .select({
      id: skillSurveyCategory.id,
      name: skillSurveyCategory.name,
      subcategory: skillSurveyCategory.subcategory,
      displayOrder: skillSurveyCategory.displayOrder,
    })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
}

async function getQuestions(catIds: string[]) {
  if (catIds.length === 0) return [];
  return db
    .select({
      id: skillSurveyQuestion.id,
      categoryId: skillSurveyQuestion.categoryId,
      questionType: skillSurveyQuestion.questionType,
      scoringKind: skillSurveyQuestion.scoringKind,
      isRequired: skillSurveyQuestion.isRequired,
    })
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, catIds));
}

describeDb('engineering-manager-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runEngineeringManagerSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用）。
  });

  it('jobType=engineering-manager の survey が 1 件・isActive・期待 title である (Req 1.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'engineering-manager'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.title).toBe('エンジニアリングマネージャー スキルアンケート');
  });

  it('コンピテンシー10カテゴリが存在し、プロフィールが displayOrder 先頭である (Req 2.1)', async () => {
    const surveyId = await getEmSurveyId();
    const cats = await getCategories(surveyId);

    // プロフィールが displayOrder 最小（先頭）
    const minOrder = Math.min(...cats.map((c) => c.displayOrder));
    const firstCats = cats.filter((c) => c.displayOrder === minOrder).map((c) => c.name);
    expect(firstCats).toEqual([PROFILE_CATEGORY]);

    // コンピテンシー（subcategory='コンピテンシー'）が 10 種
    const competencyNames = [
      ...new Set(cats.filter((c) => c.subcategory === 'コンピテンシー').map((c) => c.name)),
    ];
    expect(competencyNames).toHaveLength(10);
    expect(competencyNames.sort()).toEqual([...EXPECTED_COMPETENCIES].sort());
  });

  it('各コンピテンシーに breadth multi_choice と proficiency single_choice が共存し、proficiency 計10・level 0-3 (Req 4.1, 4.3, 5.1)', async () => {
    const surveyId = await getEmSurveyId();
    const cats = await getCategories(surveyId);
    const competencyCats = cats.filter((c) => c.subcategory === 'コンピテンシー');
    const allQs = await getQuestions(competencyCats.map((c) => c.id));

    // 各コンピテンシーに multi_choice breadth と proficiency single_choice が存在
    for (const cat of competencyCats) {
      const qs = allQs.filter((q) => q.categoryId === cat.id);
      const hasBreadth = qs.some((q) => q.questionType === 'multi_choice');
      const hasProficiency = qs.some(
        (q) => q.questionType === 'single_choice' && q.scoringKind === 'proficiency',
      );
      expect(hasBreadth, `${cat.name} に breadth multi_choice が存在`).toBe(true);
      expect(hasProficiency, `${cat.name} に proficiency single_choice が存在`).toBe(true);
    }

    // proficiency 設問は計 10
    const profQs = allQs.filter((q) => q.scoringKind === 'proficiency');
    expect(profQs).toHaveLength(10);

    // 各 proficiency 設問の選択肢は level 0-3
    for (const q of profQs) {
      const cs = await db
        .select({ level: skillSurveyChoice.level })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, q.id));
      expect(cs.map((c) => c.level).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('必須設問が各コンピテンシーに最低1件・計10件、プロフィール設問は必須でない (Req 6.1)', async () => {
    const surveyId = await getEmSurveyId();
    const cats = await getCategories(surveyId);
    const allQs = await getQuestions(cats.map((c) => c.id));

    const requiredQs = allQs.filter((q) => q.isRequired);
    expect(requiredQs).toHaveLength(10);

    const catIdToName = new Map(cats.map((c) => [c.id, c.name]));
    const requiredCatNames = new Set(requiredQs.map((q) => catIdToName.get(q.categoryId)));
    expect([...requiredCatNames].sort()).toEqual([...EXPECTED_COMPETENCIES].sort());

    // プロフィール設問は必須でない
    const profileCat = cats.find((c) => c.name === PROFILE_CATEGORY);
    expect(profileCat).toBeDefined();
    const profileQs = allQs.filter((q) => q.categoryId === profileCat!.id);
    expect(profileQs.length).toBeGreaterThan(0);
    expect(profileQs.every((q) => !q.isRequired)).toBe(true);
  });

  it('使う scoringKind は proficiency のみ（recency/frequency 未使用）(Req 5.3)', async () => {
    const surveyId = await getEmSurveyId();
    const cats = await getCategories(surveyId);
    const allQs = await getQuestions(cats.map((c) => c.id));
    const usedScoringKinds = new Set(
      allQs.map((q) => q.scoringKind).filter((k): k is NonNullable<typeof k> => k != null),
    );
    expect([...usedScoringKinds]).toEqual(['proficiency']);
  });

  it('自由記述 free_text 設問が存在し、いずれも非必須である (Req 3.4)', async () => {
    const surveyId = await getEmSurveyId();
    const cats = await getCategories(surveyId);
    const allQs = await getQuestions(cats.map((c) => c.id));
    const freeTextQs = allQs.filter((q) => q.questionType === 'free_text');
    expect(freeTextQs.length).toBeGreaterThan(0);
    expect(freeTextQs.every((q) => !q.isRequired)).toBe(true);
  });

  it('seed 再実行で設問・選択肢の総数が増えない（冪等）(Req 9.2)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runEngineeringManagerSkillSurveySeed(db);
    await runEngineeringManagerSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });

  it('非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager が共存する (Req 10.1-10.3)', async () => {
    const { runBackendSkillSurveySeed } = await import('../seeds/skill-surveys/backend');
    const { runAiDrivenDevelopmentSkillSurveySeed } = await import(
      '../seeds/skill-surveys/ai-driven-development'
    );
    const { runFrontendSkillSurveySeed } = await import('../seeds/skill-surveys/frontend');
    const { runInfrastructureSreSkillSurveySeed } = await import(
      '../seeds/skill-surveys/infrastructure-sre'
    );
    await runBackendSkillSurveySeed(db);
    await runAiDrivenDevelopmentSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);
    await runInfrastructureSreSkillSurveySeed(db);
    await runEngineeringManagerSkillSurveySeed(db);

    const surveys = await db
      .select({ jobType: skillSurvey.jobType })
      .from(skillSurvey)
      .where(
        inArray(skillSurvey.jobType, [
          'backend',
          'ai-driven-development',
          'frontend',
          'infrastructure-sre',
          'engineering-manager',
        ]),
      );
    expect(surveys.map((s) => s.jobType).sort()).toEqual(
      [
        'ai-driven-development',
        'backend',
        'engineering-manager',
        'frontend',
        'infrastructure-sre',
      ].sort(),
    );
  });
});

/**
 * pdm-strategist-survey（jobType='product-manager'）— seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/pdm-strategist-survey, tasks 4.1）:
 *  1. survey 提供: jobType='product-manager' が 1 件・isActive・期待 title (Req 1.1)
 *  2. カテゴリ構成: コンピテンシー8カテゴリ存在・PdM経験プロフィールが displayOrder 最小（先頭）(Req 2.1)
 *  3. コンピテンシー別習熟度: 各コンピテンシーに breadth multi_choice と proficiency single_choice 共存・proficiency 計8・level 0-3 (Req 5.1, 5.3, 6.1)
 *  4. 必須設問: isRequired=true が各コンピテンシーに最低1件・計8件、プロフィール設問は必須でない (Req 7.1)
 *  5. enum 健全性: 使う scoringKind は 'proficiency' のみ（recency/frequency/polarity 未使用）(Req 6.3)
 *  6. 自由記述: free_text 設問が存在し、いずれも isRequired=false (Req 4.4)
 *  7. EM 領域非重複: 設問本文・カテゴリ名が EM の対象領域キーワードと重複しない (Req 3.1)
 *  8. 冪等: runProductManagerSkillSurveySeed を再実行しても設問・選択肢が増えない (Req 11.2)
 *  9. 非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / product-manager が共存 (Req 12.1)
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
import { runProductManagerSkillSurveySeed } from '../seeds/skill-surveys/product-manager';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[product-manager-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const PROFILE_CATEGORY = 'PdM経験プロフィール';

const EXPECTED_COMPETENCIES = [
  'プロダクト戦略',
  'ディスカバリー・顧客理解',
  '優先順位付け・意思決定',
  'ロードマップ・実行推進',
  'データドリブン運用',
  'ステークホルダー・組織連携',
  'GTM・グロース連携',
  'UX・ビジネス・テクノロジーの越境',
];

// EM アンケート固有の対象領域キーワード（本アンケートには出現してはならない）。
// 職能境界（design.md）: 人と組織のマネジメント領域を PdM survey に含めない。
const EM_ONLY_KEYWORDS = [
  '1on1',
  '採用要件',
  '構造化面接',
  '採用面接',
  '評価レビュー',
  '報酬',
  '昇進',
  'キャリアラダー',
  '心理的安全性',
  'オンボーディングプログラム',
];

let db: DB;

async function getPmSurveyId(): Promise<string> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'product-manager'));
  if (!survey) throw new Error('product-manager survey not found');
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

describeDb('product-manager-survey（pdm-strategist-survey）seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runProductManagerSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用）。
  });

  it('jobType=product-manager の survey が 1 件・isActive・期待 title である (Req 1.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'product-manager'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.title).toBe('プロダクトマネージャー スキルアンケート');
  });

  it('コンピテンシー8カテゴリが存在し、PdM経験プロフィールが先頭（displayOrder 最小）である (Req 2.1)', async () => {
    const surveyId = await getPmSurveyId();
    const cats = await db
      .select({ name: skillSurveyCategory.name, displayOrder: skillSurveyCategory.displayOrder })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));

    const distinctNames = [...new Set(cats.map((c) => c.name))];
    // プロフィール + 8コンピテンシー = 9 カテゴリ
    expect(distinctNames.sort()).toEqual(
      [PROFILE_CATEGORY, ...EXPECTED_COMPETENCIES].sort(),
    );

    // プロフィールが displayOrder 最小（先頭）
    const minOrder = Math.min(...cats.map((c) => c.displayOrder));
    const firstCat = cats.find((c) => c.displayOrder === minOrder);
    expect(firstCat?.name).toBe(PROFILE_CATEGORY);
  });

  it('各コンピテンシーに breadth multi_choice と proficiency single_choice が共存し、proficiency は計8・level 0-3 (Req 5.1, 5.3, 6.1)', async () => {
    const surveyId = await getPmSurveyId();
    const cats = await db
      .select({ id: skillSurveyCategory.id, name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));

    const profQIds: string[] = [];
    for (const comp of EXPECTED_COMPETENCIES) {
      const compCatIds = cats.filter((c) => c.name === comp).map((c) => c.id);
      const qs = await db
        .select({
          id: skillSurveyQuestion.id,
          questionType: skillSurveyQuestion.questionType,
          scoringKind: skillSurveyQuestion.scoringKind,
        })
        .from(skillSurveyQuestion)
        .where(inArray(skillSurveyQuestion.categoryId, compCatIds));
      // breadth（multi_choice）が存在
      expect(qs.some((q) => q.questionType === 'multi_choice'), `${comp} に breadth が無い`).toBe(true);
      // proficiency single_choice が1つ
      const profs = qs.filter((q) => q.scoringKind === 'proficiency');
      expect(profs.length, `${comp} の proficiency 数`).toBe(1);
      expect(profs[0]?.questionType).toBe('single_choice');
      profQIds.push(profs[0]!.id);
    }

    expect(profQIds).toHaveLength(8);
    for (const qId of profQIds) {
      const cs = await db
        .select({ level: skillSurveyChoice.level })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, qId));
      expect(cs.map((c) => c.level).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('必須設問が各コンピテンシーに最低1件・計8件、プロフィール設問は必須でない (Req 7.1)', async () => {
    const surveyId = await getPmSurveyId();
    const cats = await db
      .select({ id: skillSurveyCategory.id, name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const catIdToName = new Map(cats.map((c) => [c.id, c.name]));
    const allQs = await db
      .select({
        categoryId: skillSurveyQuestion.categoryId,
        isRequired: skillSurveyQuestion.isRequired,
      })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, [...catIdToName.keys()]));

    const requiredCatNames = allQs
      .filter((q) => q.isRequired)
      .map((q) => catIdToName.get(q.categoryId));
    // 計8件・各コンピテンシーに1件
    expect(requiredCatNames).toHaveLength(8);
    expect([...new Set(requiredCatNames)].sort()).toEqual([...EXPECTED_COMPETENCIES].sort());
    // プロフィールの設問は必須でない
    expect(requiredCatNames).not.toContain(PROFILE_CATEGORY);
  });

  it('scoringKind は proficiency のみ（recency/frequency/polarity 未使用）(Req 6.3)', async () => {
    const surveyId = await getPmSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const qs = await db
      .select({ scoringKind: skillSurveyQuestion.scoringKind })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const usedScoringKinds = new Set(
      qs.map((q) => q.scoringKind).filter((k): k is NonNullable<typeof k> => k != null),
    );
    expect([...usedScoringKinds]).toEqual(['proficiency']);
  });

  it('free_text 設問が存在し、いずれも isRequired=false である (Req 4.4)', async () => {
    const surveyId = await getPmSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const rows = await db
      .select({
        questionType: skillSurveyQuestion.questionType,
        isRequired: skillSurveyQuestion.isRequired,
      })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const freeTexts = rows.filter((q) => q.questionType === 'free_text');
    expect(freeTexts.length).toBeGreaterThan(0);
    for (const q of freeTexts) {
      expect(q.isRequired).toBe(false);
    }
  });

  it('EM アンケートの対象領域キーワードが設問本文・カテゴリ名に出現しない (Req 3.1)', async () => {
    const surveyId = await getPmSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const bodies = await db
      .select({ body: skillSurveyQuestion.body })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const labels = await db
      .select({ label: skillSurveyChoice.label })
      .from(skillSurveyChoice)
      .where(inArray(skillSurveyChoice.questionId, qIds));
    const catNames = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));

    const haystack = [
      ...bodies.map((b) => b.body),
      ...labels.map((l) => l.label),
      ...catNames.map((c) => c.name),
    ].join('\n');

    for (const kw of EM_ONLY_KEYWORDS) {
      expect(haystack, `EM 固有キーワード「${kw}」が PdM survey に出現している`).not.toContain(kw);
    }
  });

  it('seed 再実行で設問・選択肢の総数が増えない（冪等）(Req 11.2)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runProductManagerSkillSurveySeed(db);
    await runProductManagerSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });

  it('非回帰: backend / frontend / ai-driven-development / infrastructure-sre / engineering-manager / product-manager が共存する (Req 12.1)', async () => {
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
    await runProductManagerSkillSurveySeed(db);

    const expected = [
      'ai-driven-development',
      'backend',
      'engineering-manager',
      'frontend',
      'infrastructure-sre',
      'product-manager',
    ];
    const surveys = await db
      .select({ jobType: skillSurvey.jobType })
      .from(skillSurvey)
      .where(inArray(skillSurvey.jobType, expected));
    expect(surveys.map((s) => s.jobType).sort()).toEqual([...expected].sort());
  });
});

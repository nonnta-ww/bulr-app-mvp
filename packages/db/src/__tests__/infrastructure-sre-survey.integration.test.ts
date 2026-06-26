/**
 * infrastructure-sre-survey — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/infrastructure-sre-survey, tasks 4.1）:
 *  1. 冪等: runInfrastructureSreSkillSurveySeed を再実行しても設問・選択肢が増えない (Req 9.2)
 *  2. survey 提供: jobType='infrastructure-sre' が 1 件・isActive・期待 title (Req 1.1)
 *  3. カテゴリ構成: トップカテゴリ distinct=12（共通インフラ6＋SRE・信頼性6）(Req 2.1, 2.2)
 *  4. 両層カバー: 信頼性固有語（SLO・エラーバジェット・ポストモーテム・トイル）が出現 (Req 2.3)
 *  5. 必須設問: isRequired=true が各トップカテゴリに最低1件・計12件 (Req 6.1)
 *  6. proficiency: scoringKind='proficiency' の設問は level 0-3 を持ち、代表習熟度が対象5カテゴリに存在 (Req 4.3, 5.1)
 *  7. enum 健全性: 使う scoringKind は 'proficiency' のみ（recency/frequency 未使用）(Req 5.3)
 *  8. 非回帰: backend / frontend / ai-driven-development / infrastructure-sre が共存 (Req 10.1-10.3)
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
import { runInfrastructureSreSkillSurveySeed } from '../seeds/skill-surveys/infrastructure-sre';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[infrastructure-sre-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const EXPECTED_TOP_CATEGORIES = [
  // 共通インフラ層
  'クラウド・プラットフォーム',
  'コンテナ・オーケストレーション',
  'IaC・構成管理',
  'ネットワーク',
  'CI/CD・デリバリー',
  'OS・ミドルウェア',
  // SRE・信頼性層
  '可観測性',
  '信頼性設計',
  'インシデント対応・オンコール',
  '自動化・トイル削減',
  'セキュリティ・コンプライアンス',
  'パフォーマンス・スケーラビリティ・コスト最適化',
];

// 代表習熟度ペアを持つカテゴリ
const REP_PROFICIENCY_CATEGORIES = [
  'クラウド・プラットフォーム',
  'コンテナ・オーケストレーション',
  'IaC・構成管理',
  'CI/CD・デリバリー',
  '可観測性',
];

// 両層カバーの証拠（SRE・信頼性固有語）
const RELIABILITY_TERMS = ['SLO', 'エラーバジェット', 'ポストモーテム', 'トイル'];

let db: DB;

async function getInfraSreSurveyId(): Promise<string> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'infrastructure-sre'));
  if (!survey) throw new Error('infrastructure-sre survey not found');
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

describeDb('infrastructure-sre-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runInfrastructureSreSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用）。
  });

  it('jobType=infrastructure-sre の survey が 1 件・isActive・期待 title である (Req 1.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'infrastructure-sre'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.title).toBe('インフラ・SREエンジニア スキルアンケート');
  });

  it('トップカテゴリが共通インフラ6＋SRE・信頼性6の計12種である (Req 2.1, 2.2)', async () => {
    const surveyId = await getInfraSreSurveyId();
    const cats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const distinctNames = [...new Set(cats.map((c) => c.name))];
    expect(distinctNames).toHaveLength(12);
    expect(distinctNames.sort()).toEqual([...EXPECTED_TOP_CATEGORIES].sort());
  });

  it('SRE・信頼性固有の観点が設問/選択肢に出現する (Req 2.3)', async () => {
    const surveyId = await getInfraSreSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const bodies = await db
      .select({ body: skillSurveyQuestion.body })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const labels = await db
      .select({ label: skillSurveyChoice.label })
      .from(skillSurveyChoice)
      .where(inArray(skillSurveyChoice.questionId, qIds));
    const haystack = [...bodies.map((b) => b.body), ...labels.map((l) => l.label)].join('\n');
    for (const term of RELIABILITY_TERMS) {
      expect(haystack).toContain(term);
    }
  });

  it('必須設問が各トップカテゴリに最低1件・計12件である (Req 6.1)', async () => {
    const surveyId = await getInfraSreSurveyId();
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
    expect(requiredCatIds).toHaveLength(12);

    const catIdToName = new Map(cats.map((c) => [c.id, c.name]));
    const requiredTopCategories = new Set(requiredCatIds.map((id) => catIdToName.get(id)));
    expect([...requiredTopCategories].sort()).toEqual([...EXPECTED_TOP_CATEGORIES].sort());
  });

  it('proficiency 設問は level 0-3 を持ち scoringKind は proficiency のみ、代表習熟度が5カテゴリに存在 (Req 4.3, 5.1, 5.3)', async () => {
    const surveyId = await getInfraSreSurveyId();
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

    // 代表習熟度サブカテゴリが対象5カテゴリに存在する
    const repCats = await db
      .select({ name: skillSurveyCategory.name, subcategory: skillSurveyCategory.subcategory })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    const hasRep = repCats.filter((c) => c.subcategory === '代表習熟度').map((c) => c.name);
    expect(hasRep.sort()).toEqual([...REP_PROFICIENCY_CATEGORIES].sort());
  });

  it('seed 再実行で設問・選択肢の総数が増えない（冪等）(Req 9.2)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runInfrastructureSreSkillSurveySeed(db);
    await runInfrastructureSreSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });

  it('非回帰: backend / frontend / ai-driven-development / infrastructure-sre が共存する (Req 10.1-10.3)', async () => {
    const { runBackendSkillSurveySeed } = await import('../seeds/skill-surveys/backend');
    const { runAiDrivenDevelopmentSkillSurveySeed } = await import(
      '../seeds/skill-surveys/ai-driven-development'
    );
    const { runFrontendSkillSurveySeed } = await import('../seeds/skill-surveys/frontend');
    await runBackendSkillSurveySeed(db);
    await runAiDrivenDevelopmentSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);
    await runInfrastructureSreSkillSurveySeed(db);

    const surveys = await db
      .select({ jobType: skillSurvey.jobType })
      .from(skillSurvey)
      .where(
        inArray(skillSurvey.jobType, [
          'backend',
          'ai-driven-development',
          'frontend',
          'infrastructure-sre',
        ]),
      );
    expect(surveys.map((s) => s.jobType).sort()).toEqual(
      ['ai-driven-development', 'backend', 'frontend', 'infrastructure-sre'].sort(),
    );
  });
});

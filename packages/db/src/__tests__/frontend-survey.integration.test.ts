/**
 * frontend-survey — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/frontend-survey, tasks 4.1）:
 *  1. 冪等: runFrontendSkillSurveySeed を再実行しても設問・選択肢が増えない (Req 9.2)
 *  2. survey 提供: jobType='frontend' が 1 件・isActive・期待 title (Req 1.1)
 *  3. カテゴリ構成: トップカテゴリ distinct=10、'その他' 不在 (Req 2.1, 2.3)
 *  4. 必須設問: isRequired=true が各トップカテゴリに最低1件・計10件 (Req 6.1)
 *  5. proficiency: scoringKind='proficiency' の設問は level 0-3 を持つ。
 *     代表習熟度サブカテゴリが HTML・CSS / JavaScript / フレームワーク・ライブラリ に存在 (Req 4.2, 4.4, 5.1)
 *  6. enum 健全性: frontend が使う scoringKind は 'proficiency' のみ（recency/frequency 未使用）(Req 5.3)
 *  7. 誤字補正: 補正対象文字列が body/label に存在しない (Req 3.3)
 *  8. 非回帰: backend / ai-driven-development / frontend が衝突せず共存 (Req 10.1, 10.2, 10.3)
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する。
 * スキーマは drizzle migrator で自己適用する。
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
import { runFrontendSkillSurveySeed } from '../seeds/skill-surveys/frontend';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[frontend-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const EXPECTED_TOP_CATEGORIES = [
  'HTML・CSS',
  'JavaScript',
  'フレームワーク・ライブラリ',
  'UI/UXスキル',
  'バックエンド連携',
  'セキュリティ',
  'アーキテクチャ設計',
  'パフォーマンス・チューニング',
  'テスト',
  'ビルド・デプロイ',
];

// 誤字補正の検証: 補正前の文字列が seed 投入結果に残っていないこと
const FORBIDDEN_SUBSTRINGS = [
  'Crome',
  'Server Worker',
  '教会',
  'OpeinAPI',
  'Svelt Testing',
  'メモカ',
  'X-Frame-Optons',
  'Tailwind CSSS',
  'Datadog. RUM',
];

let db: DB;

/** frontend survey 配下の設問 ID を全取得する */
async function getFrontendQuestionIds(): Promise<string[]> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'frontend'));
  if (!survey) return [];
  const cats = await db
    .select({ id: skillSurveyCategory.id })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, survey.id));
  const catIds = cats.map((c) => c.id);
  if (catIds.length === 0) return [];
  const qs = await db
    .select({ id: skillSurveyQuestion.id })
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, catIds));
  return qs.map((q) => q.id);
}

describeDb('frontend-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runFrontendSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用）。
  });

  it('jobType=frontend の survey が 1 件・isActive・期待 title である (Req 1.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'frontend'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.title).toBe('フロントエンドエンジニア スキルアンケート');
  });

  it('トップカテゴリが期待の10種で、その他が存在しない (Req 2.1, 2.3)', async () => {
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'frontend'));
    const cats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const distinctNames = [...new Set(cats.map((c) => c.name))];
    expect(distinctNames.sort()).toEqual([...EXPECTED_TOP_CATEGORIES].sort());
    expect(distinctNames).not.toContain('その他');
  });

  it('必須設問が各トップカテゴリに最低1件・計10件である (Req 6.1)', async () => {
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'frontend'));
    const cats = await db
      .select({ id: skillSurveyCategory.id, name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const catIds = cats.map((c) => c.id);
    const requiredQs = await db
      .select({ categoryId: skillSurveyQuestion.categoryId })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, catIds));

    // isRequired=true のみを数えるため再取得（drizzle の boolean フィルタ）
    const allQs = await db
      .select({
        categoryId: skillSurveyQuestion.categoryId,
        isRequired: skillSurveyQuestion.isRequired,
      })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, catIds));
    const requiredCatIds = allQs.filter((q) => q.isRequired).map((q) => q.categoryId);
    expect(requiredCatIds).toHaveLength(10);

    const catIdToName = new Map(cats.map((c) => [c.id, c.name]));
    const requiredTopCategories = new Set(requiredCatIds.map((id) => catIdToName.get(id)));
    expect([...requiredTopCategories].sort()).toEqual([...EXPECTED_TOP_CATEGORIES].sort());
    void requiredQs;
  });

  it('proficiency 設問は level 0-3 を持ち、scoringKind は proficiency のみ (Req 4.4, 5.1, 5.3)', async () => {
    const qIds = await getFrontendQuestionIds();
    const profQs = await db
      .select({ id: skillSurveyQuestion.id, scoringKind: skillSurveyQuestion.scoringKind })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));

    const usedScoringKinds = new Set(
      profQs.map((q) => q.scoringKind).filter((k): k is NonNullable<typeof k> => k != null),
    );
    expect([...usedScoringKinds]).toEqual(['proficiency']);

    const profQIds = profQs.filter((q) => q.scoringKind === 'proficiency').map((q) => q.id);
    expect(profQIds.length).toBeGreaterThan(0);
    for (const qId of profQIds) {
      const choices = await db
        .select({ level: skillSurveyChoice.level })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, qId));
      const levels = choices.map((c) => c.level).sort();
      expect(levels).toEqual([0, 1, 2, 3]);
    }
  });

  it('代表習熟度サブカテゴリが3カテゴリに存在する (Req 4.2)', async () => {
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'frontend'));
    const repCats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const repNames = repCats
      .filter((c) => c.name === 'HTML・CSS' || c.name === 'JavaScript' || c.name === 'フレームワーク・ライブラリ')
      .map((c) => c.name);
    // 各カテゴリは複数 subcategory を持つため、代表習熟度を持つ3カテゴリが存在することを別途確認
    const repSubcats = await db
      .select({ name: skillSurveyCategory.name, subcategory: skillSurveyCategory.subcategory })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const hasRep = repSubcats.filter((c) => c.subcategory === '代表習熟度').map((c) => c.name);
    expect(hasRep.sort()).toEqual(
      ['HTML・CSS', 'JavaScript', 'フレームワーク・ライブラリ'].sort(),
    );
    void repNames;
  });

  it('誤字補正済み: 補正対象文字列が body/label に存在しない (Req 3.3)', async () => {
    const qIds = await getFrontendQuestionIds();
    const bodies = await db
      .select({ body: skillSurveyQuestion.body })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const labels = await db
      .select({ label: skillSurveyChoice.label })
      .from(skillSurveyChoice)
      .where(inArray(skillSurveyChoice.questionId, qIds));
    const haystack = [...bodies.map((b) => b.body), ...labels.map((l) => l.label)].join('\n');
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(haystack).not.toContain(forbidden);
    }
  });

  it('seed 再実行で設問・選択肢の総数が増えない（冪等）(Req 9.2)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runFrontendSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });

  it('非回帰: backend / ai-driven-development / frontend が共存する (Req 10.1, 10.2, 10.3)', async () => {
    const { runBackendSkillSurveySeed } = await import('../seeds/skill-surveys/backend');
    const { runAiDrivenDevelopmentSkillSurveySeed } = await import(
      '../seeds/skill-surveys/ai-driven-development'
    );
    await runBackendSkillSurveySeed(db);
    await runAiDrivenDevelopmentSkillSurveySeed(db);
    await runFrontendSkillSurveySeed(db);

    const surveys = await db
      .select({ jobType: skillSurvey.jobType })
      .from(skillSurvey)
      .where(
        inArray(skillSurvey.jobType, ['backend', 'ai-driven-development', 'frontend']),
      );
    const jobTypes = surveys.map((s) => s.jobType).sort();
    expect(jobTypes).toEqual(['ai-driven-development', 'backend', 'frontend']);
  });
});

/**
 * worklife-disposition-survey — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/worklife-disposition-survey, tasks 4.3）:
 *  1. survey 提供: kind/jobType='worklife-disposition' が1件・isActive・期待 title (R1.1)
 *  2. カテゴリ構成: 5志向カテゴリ・subcategory 非null (R1.2/1.5)
 *  3. 設問: 各カテゴリ4問・計20問・全て single_choice/polarity/isRequired、level 0-4 (R1.3/1.4)
 *  4. enum 健全性: 使う scoringKind は polarity のみ
 *  5. 冪等: 再実行で設問・選択肢が増えない (R1.6)
 *
 * 実行前提: ローカル Postgres 起動 + DATABASE_URL。未設定時はスイートごと skip。
 *   スキーマは drizzle migrator で自己適用（クリーン DB 推奨）。
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
import { runWorklifeDispositionSkillSurveySeed } from '../seeds/skill-surveys/worklife-disposition';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[worklife-disposition-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const EXPECTED_CATEGORIES = [
  '改善志向',
  '障害対応志向',
  '育成志向',
  '調整・橋渡し志向',
  '新技術採用志向',
];

let db: DB;

async function getWorklifeSurveyId(): Promise<string> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.kind, 'worklife_disposition'));
  if (!survey) throw new Error('worklife-disposition survey not found');
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

describeDb('worklife-disposition-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runWorklifeDispositionSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用）。
  });

  it('kind/jobType=worklife-disposition の survey が1件・isActive・期待 title (R1.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.kind, 'worklife_disposition'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.jobType).toBe('worklife-disposition');
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.title).toBe('働き方の志向診断');
  });

  it('5志向カテゴリが存在し subcategory は非null (R1.2/1.5)', async () => {
    const surveyId = await getWorklifeSurveyId();
    const cats = await db
      .select({ name: skillSurveyCategory.name, subcategory: skillSurveyCategory.subcategory })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
    expect(cats.map((c) => c.name).sort()).toEqual([...EXPECTED_CATEGORIES].sort());
    for (const c of cats) {
      expect(c.subcategory).not.toBeNull();
      expect(c.subcategory).toBe('働き方の志向');
    }
  });

  it('各カテゴリ4問・計20問・全て single_choice/polarity/isRequired、選択肢 level 0-4 (R1.3/1.4)', async () => {
    const surveyId = await getWorklifeSurveyId();
    const cats = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId));

    let totalQuestions = 0;
    for (const cat of cats) {
      const qs = await db
        .select({
          id: skillSurveyQuestion.id,
          questionType: skillSurveyQuestion.questionType,
          scoringKind: skillSurveyQuestion.scoringKind,
          isRequired: skillSurveyQuestion.isRequired,
        })
        .from(skillSurveyQuestion)
        .where(eq(skillSurveyQuestion.categoryId, cat.id));
      expect(qs).toHaveLength(4);
      totalQuestions += qs.length;
      for (const q of qs) {
        expect(q.questionType).toBe('single_choice');
        expect(q.scoringKind).toBe('polarity');
        expect(q.isRequired).toBe(true);
        const cs = await db
          .select({ level: skillSurveyChoice.level })
          .from(skillSurveyChoice)
          .where(eq(skillSurveyChoice.questionId, q.id));
        expect(cs.map((c) => c.level).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 2, 3, 4]);
      }
    }
    expect(totalQuestions).toBe(20);
  });

  it('使う scoringKind は polarity のみ', async () => {
    const surveyId = await getWorklifeSurveyId();
    const qIds = await getQuestionIds(surveyId);
    const qs = await db
      .select({ scoringKind: skillSurveyQuestion.scoringKind })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const kinds = new Set(qs.map((q) => q.scoringKind));
    expect([...kinds]).toEqual(['polarity']);
  });

  it('seed 再実行で設問・選択肢の総数が増えない（冪等）(R1.6)', async () => {
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runWorklifeDispositionSkillSurveySeed(db);
    await runWorklifeDispositionSkillSurveySeed(db);

    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });
});

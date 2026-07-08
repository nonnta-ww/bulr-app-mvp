/**
 * 思考スタイル診断 — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/thinking-style-diagnosis, task 3.1 / Req 5.1, 5.3, 5.4）:
 *  1. survey 提供: jobType='thinking_style' かつ kind='thinking_style' が 1 件・期待 title
 *  2. カテゴリ構成: ちょうど4カテゴリ（'抽象と具体','論理と直感','収束と発散','理論と実践'）・
 *     各 subcategory 非null（'思考スタイル'）・各6問・計24設問・全て scoringKind='polarity'
 *  3. Likert: 各設問は5択で level が 0..4 を網羅する
 *  4. 冪等: runThinkingStyleSkillSurveySeed 再実行でカテゴリ/設問/選択肢の数が増えない
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する。スキーマは drizzle migrator で自己適用する。
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
import { runThinkingStyleSkillSurveySeed } from '../seeds/skill-surveys/thinking-style';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[thinking-style-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const EXPECTED_CATEGORIES = ['抽象と具体', '論理と直感', '収束と発散', '理論と実践'];

let db: DB;

/** thinking_style survey 配下のカテゴリ ID を全取得する */
async function getThinkingStyleCategoryIds(): Promise<string[]> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'thinking_style'));
  if (!survey) return [];
  const cats = await db
    .select({ id: skillSurveyCategory.id })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, survey.id));
  return cats.map((c) => c.id);
}

/** thinking_style survey 配下の設問 ID を全取得する */
async function getThinkingStyleQuestionIds(): Promise<string[]> {
  const catIds = await getThinkingStyleCategoryIds();
  if (catIds.length === 0) return [];
  const qs = await db
    .select({ id: skillSurveyQuestion.id })
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, catIds));
  return qs.map((q) => q.id);
}

describeDb('thinking-style-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runThinkingStyleSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用・既存 seed テスト踏襲）。
  });

  it('jobType=thinking_style の survey が 1 件・kind=thinking_style・期待 title である (Req 5.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'thinking_style'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('thinking_style');
    expect(rows[0]?.title).toBe('思考スタイル診断');
  });

  it('カテゴリはちょうど4種（抽象と具体 / 論理と直感 / 収束と発散 / 理論と実践）である (Req 5.1)', async () => {
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'thinking_style'));
    const cats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const names = cats.map((c) => c.name).sort();
    expect(names).toEqual([...EXPECTED_CATEGORIES].sort());
  });

  it('各カテゴリの subcategory は非null（思考スタイル）である (Req 5.1)', async () => {
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'thinking_style'));
    const cats = await db
      .select({ subcategory: skillSurveyCategory.subcategory })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    expect(cats).toHaveLength(4);
    for (const c of cats) {
      expect(c.subcategory).not.toBeNull();
      expect(c.subcategory).toBe('思考スタイル');
    }
  });

  it('各カテゴリはちょうど6問・計24問である (Req 5.1)', async () => {
    const catIds = await getThinkingStyleCategoryIds();
    expect(catIds).toHaveLength(4);
    for (const catId of catIds) {
      const rows = await db
        .select({ c: count() })
        .from(skillSurveyQuestion)
        .where(eq(skillSurveyQuestion.categoryId, catId));
      expect(rows[0]?.c ?? 0).toBe(6);
    }
    const qIds = await getThinkingStyleQuestionIds();
    expect(qIds).toHaveLength(24);
  });

  it('設問は全て scoringKind=polarity である (Req 5.3)', async () => {
    const qIds = await getThinkingStyleQuestionIds();
    expect(qIds).toHaveLength(24);
    const qs = await db
      .select({ scoringKind: skillSurveyQuestion.scoringKind })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const kinds = new Set(qs.map((q) => q.scoringKind));
    expect([...kinds]).toEqual(['polarity']);
  });

  it('各設問は5択で level が 0..4 を網羅する (Req 5.3)', async () => {
    const qIds = await getThinkingStyleQuestionIds();
    for (const qId of qIds) {
      const choices = await db
        .select({ level: skillSurveyChoice.level })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, qId));
      const levels = choices.map((c) => c.level).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(levels).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('seed 再実行でカテゴリ/設問/選択肢の総数が増えない（冪等）(Req 5.4)', async () => {
    const beforeCat = (await db.select({ c: count() }).from(skillSurveyCategory))[0]?.c ?? 0;
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runThinkingStyleSkillSurveySeed(db);
    await runThinkingStyleSkillSurveySeed(db);

    const afterCat = (await db.select({ c: count() }).from(skillSurveyCategory))[0]?.c ?? 0;
    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterCat).toBe(beforeCat);
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });
});

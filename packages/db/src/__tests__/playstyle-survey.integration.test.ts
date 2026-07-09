/**
 * playstyle（気質）診断 — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/rpg-class-diagnosis, task 5 / Req 2.1, 2.2）:
 *  1. survey 提供: jobType='playstyle' かつ kind='playstyle' が 1 件・期待 title
 *  2. カテゴリ構成: ちょうど4カテゴリ（'探索と深化','個人と協調','計画と即興','堅実と挑戦'）・計24設問・全て scoringKind='polarity'
 *  3. Likert: 各設問は5択で level が 0..4 を網羅する
 *  4. 冪等: runPlaystyleSkillSurveySeed 再実行でカテゴリ/設問/選択肢の数が増えない
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
import { runPlaystyleSkillSurveySeed } from '../seeds/skill-surveys/playstyle';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[playstyle-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const EXPECTED_CATEGORIES = ['個人と協調', '探索と深化', '計画と即興', '堅実と挑戦'];

let db: DB;

/** playstyle survey 配下のカテゴリ ID を全取得する */
async function getPlaystyleCategoryIds(): Promise<string[]> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'playstyle'));
  if (!survey) return [];
  const cats = await db
    .select({ id: skillSurveyCategory.id })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, survey.id));
  return cats.map((c) => c.id);
}

/** playstyle survey 配下の設問 ID を全取得する */
async function getPlaystyleQuestionIds(): Promise<string[]> {
  const catIds = await getPlaystyleCategoryIds();
  if (catIds.length === 0) return [];
  const qs = await db
    .select({ id: skillSurveyQuestion.id })
    .from(skillSurveyQuestion)
    .where(inArray(skillSurveyQuestion.categoryId, catIds));
  return qs.map((q) => q.id);
}

describeDb('playstyle-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runPlaystyleSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用・既存 seed テスト踏襲）。
  });

  it('jobType=playstyle の survey が 1 件・kind=playstyle・期待 title である (Req 2.1)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'playstyle'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('playstyle');
    expect(rows[0]?.title).toBe('プレイスタイル（気質）診断');
  });

  it('カテゴリはちょうど4種（探索と深化 / 個人と協調 / 計画と即興 / 堅実と挑戦）である (Req 2.1)', async () => {
    const [survey] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'playstyle'));
    const cats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, survey!.id));
    const names = cats.map((c) => c.name).sort();
    expect(names).toEqual([...EXPECTED_CATEGORIES].sort());
  });

  it('設問は計24問・全て scoringKind=polarity である (Req 2.2)', async () => {
    const qIds = await getPlaystyleQuestionIds();
    expect(qIds).toHaveLength(24);
    const qs = await db
      .select({ scoringKind: skillSurveyQuestion.scoringKind })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    const kinds = new Set(qs.map((q) => q.scoringKind));
    expect([...kinds]).toEqual(['polarity']);
  });

  it('設問は全て必須（isRequired=true）である (Req 5.6)', async () => {
    const qIds = await getPlaystyleQuestionIds();
    expect(qIds).toHaveLength(24);
    const qs = await db
      .select({ isRequired: skillSurveyQuestion.isRequired })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.id, qIds));
    expect(qs.every((q) => q.isRequired)).toBe(true);
  });

  it('各設問は5択で level が 0..4 を網羅する (Req 2.2)', async () => {
    const qIds = await getPlaystyleQuestionIds();
    for (const qId of qIds) {
      const choices = await db
        .select({ level: skillSurveyChoice.level })
        .from(skillSurveyChoice)
        .where(eq(skillSurveyChoice.questionId, qId));
      const levels = choices.map((c) => c.level).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(levels).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('seed 再実行でカテゴリ/設問/選択肢の総数が増えない（冪等）(Req 2.1)', async () => {
    const beforeCat = (await db.select({ c: count() }).from(skillSurveyCategory))[0]?.c ?? 0;
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runPlaystyleSkillSurveySeed(db);
    await runPlaystyleSkillSurveySeed(db);

    const afterCat = (await db.select({ c: count() }).from(skillSurveyCategory))[0]?.c ?? 0;
    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterCat).toBe(beforeCat);
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });
});

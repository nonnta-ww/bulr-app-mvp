/**
 * チームワーク・スタイル診断 — seed の統合テスト（実 DB 接続）
 *
 * 検証内容（spec: .kiro/specs/teamwork-style-diagnosis, task 3.1 / Req 2.4, 4.6, 5.1, 5.2, 3.5）:
 *  1. survey 提供: jobType='teamwork_style' かつ kind='teamwork_style' が 1 件・期待 title
 *  2. カテゴリ構成: ちょうど7カテゴリ（L1 4軸＋L2 3ディメンション）・各 subcategory 非null
 *  3. L1（率直さ/判断の重心/距離感/異論への構え）: 各3問（奇数）・isRequired=true・single_choice・
 *     各設問2択で level=[0,1]（第1極/第2極）
 *  4. L2（自己認識/他者視点の取得/感情の自己制御）: 各2問・isRequired=false・single_choice・
 *     各設問3択で level=[0,1,2]（発達段階）
 *  5. 総設問18・冪等（再実行で総数が増えない）
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
import { runTeamworkStyleSkillSurveySeed } from '../seeds/skill-surveys/teamwork-style';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[teamwork-style-survey.seed] DATABASE_URL 未設定のためスキップします。');
}

const L1_CATEGORIES = ['率直さ', '判断の重心', '距離感', '異論への構え'];
const L2_CATEGORIES = ['自己認識', '他者視点の取得', '感情の自己制御'];
const EXPECTED_CATEGORIES = [...L1_CATEGORIES, ...L2_CATEGORIES];

let db: DB;

/** teamwork_style survey の id を返す（無ければ null）。 */
async function getSurveyId(): Promise<string | null> {
  const [survey] = await db
    .select({ id: skillSurvey.id })
    .from(skillSurvey)
    .where(eq(skillSurvey.jobType, 'teamwork_style'));
  return survey?.id ?? null;
}

/** category 名 → その category 配下の設問行を返す。 */
async function questionsOfCategory(surveyId: string, name: string) {
  const cats = await db
    .select({ id: skillSurveyCategory.id, name: skillSurveyCategory.name })
    .from(skillSurveyCategory)
    .where(eq(skillSurveyCategory.skillSurveyId, surveyId));
  const target = cats.find((c) => c.name === name);
  if (!target) return [];
  return db
    .select()
    .from(skillSurveyQuestion)
    .where(eq(skillSurveyQuestion.categoryId, target.id));
}

describeDb('teamwork-style-survey seed 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runTeamworkStyleSkillSurveySeed(db);
  });

  afterAll(async () => {
    // seed はマスタデータ（共有）のため削除しない（冪等運用・既存 seed テスト踏襲）。
  });

  it('jobType=teamwork_style の survey が 1 件・kind=teamwork_style・期待 title である (Req 2.4)', async () => {
    const rows = await db
      .select()
      .from(skillSurvey)
      .where(eq(skillSurvey.jobType, 'teamwork_style'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('teamwork_style');
    expect(rows[0]?.title).toBe('チームワーク・スタイル診断');
  });

  it('カテゴリはちょうど7種（L1 4軸＋L2 3ディメンション）である (Req 2.4)', async () => {
    const surveyId = await getSurveyId();
    expect(surveyId).not.toBeNull();
    const cats = await db
      .select({ name: skillSurveyCategory.name })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId!));
    expect(cats.map((c) => c.name).sort()).toEqual([...EXPECTED_CATEGORIES].sort());
  });

  it('各カテゴリの subcategory は非null（チームワーク・スタイル）である (Req 2.4)', async () => {
    const surveyId = await getSurveyId();
    const cats = await db
      .select({ subcategory: skillSurveyCategory.subcategory })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId!));
    expect(cats).toHaveLength(7);
    for (const c of cats) {
      expect(c.subcategory).not.toBeNull();
      expect(c.subcategory).toBe('チームワーク・スタイル');
    }
  });

  it('L1 各軸: 3問（奇数）・isRequired=true・2択で level=[0,1] (Req 4.6)', async () => {
    const surveyId = await getSurveyId();
    for (const name of L1_CATEGORIES) {
      const qs = await questionsOfCategory(surveyId!, name);
      expect(qs).toHaveLength(3);
      expect(qs.every((q) => q.isRequired)).toBe(true);
      expect(qs.every((q) => q.questionType === 'single_choice')).toBe(true);
      for (const q of qs) {
        const choices = await db
          .select({ level: skillSurveyChoice.level })
          .from(skillSurveyChoice)
          .where(eq(skillSurveyChoice.questionId, q.id));
        const levels = choices.map((c) => c.level).sort((a, b) => (a ?? 0) - (b ?? 0));
        expect(levels).toEqual([0, 1]);
      }
    }
  });

  it('L2 各ディメンション: 2問・isRequired=false・3択で level=[0,1,2] (Req 5.1, 5.2, 3.5)', async () => {
    const surveyId = await getSurveyId();
    for (const name of L2_CATEGORIES) {
      const qs = await questionsOfCategory(surveyId!, name);
      expect(qs).toHaveLength(2);
      expect(qs.every((q) => q.isRequired === false)).toBe(true);
      expect(qs.every((q) => q.questionType === 'single_choice')).toBe(true);
      for (const q of qs) {
        const choices = await db
          .select({ level: skillSurveyChoice.level })
          .from(skillSurveyChoice)
          .where(eq(skillSurveyChoice.questionId, q.id));
        const levels = choices.map((c) => c.level).sort((a, b) => (a ?? 0) - (b ?? 0));
        expect(levels).toEqual([0, 1, 2]);
      }
    }
  });

  it('総設問は18問である (Req 2.4)', async () => {
    const surveyId = await getSurveyId();
    const cats = await db
      .select({ id: skillSurveyCategory.id })
      .from(skillSurveyCategory)
      .where(eq(skillSurveyCategory.skillSurveyId, surveyId!));
    const rows = await db
      .select({ c: count() })
      .from(skillSurveyQuestion)
      .where(inArray(skillSurveyQuestion.categoryId, cats.map((c) => c.id)));
    expect(rows[0]?.c ?? 0).toBe(18);
  });

  it('seed 再実行でカテゴリ/設問/選択肢の総数が増えない（冪等）(Req 2.4)', async () => {
    const beforeCat = (await db.select({ c: count() }).from(skillSurveyCategory))[0]?.c ?? 0;
    const beforeQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const beforeC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;

    await runTeamworkStyleSkillSurveySeed(db);
    await runTeamworkStyleSkillSurveySeed(db);

    const afterCat = (await db.select({ c: count() }).from(skillSurveyCategory))[0]?.c ?? 0;
    const afterQ = (await db.select({ c: count() }).from(skillSurveyQuestion))[0]?.c ?? 0;
    const afterC = (await db.select({ c: count() }).from(skillSurveyChoice))[0]?.c ?? 0;
    expect(afterCat).toBe(beforeCat);
    expect(afterQ).toBe(beforeQ);
    expect(afterC).toBe(beforeC);
  });
});

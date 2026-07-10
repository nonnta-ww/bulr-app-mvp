/**
 * get-worklife-disposition-survey-id — 統合テスト（実 DB 接続）
 *
 * seed 済み DB で `kind='worklife_disposition'` survey の id を返すことを検証する
 * （spec: worklife-disposition-survey, R6.1）。DATABASE_URL 未設定時は skip。
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { DB } from '../client';
import { skillSurvey } from '../schema/skill-survey';
import { runWorklifeDispositionSkillSurveySeed } from '../seeds/skill-surveys/worklife-disposition';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[get-worklife-disposition-survey-id.integration] DATABASE_URL 未設定のためスキップします。');
}

let db: DB;
let getWorklifeDispositionSurveyId: typeof import('../queries/worklife-disposition/get-worklife-disposition-survey-id')['getWorklifeDispositionSurveyId'];

describeDb('get-worklife-disposition-survey-id 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/worklife-disposition/get-worklife-disposition-survey-id');
    getWorklifeDispositionSurveyId = queryMod.getWorklifeDispositionSurveyId;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runWorklifeDispositionSkillSurveySeed(db);
  });

  it('seed 済み → worklife_disposition survey の id（string）を返す (R6.1)', async () => {
    const id = await getWorklifeDispositionSurveyId();

    expect(id).not.toBeNull();
    expect(typeof id).toBe('string');

    const [row] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.kind, 'worklife_disposition'))
      .limit(1);
    expect(row).toBeTruthy();
    expect(id).toBe(row!.id);
  });
});

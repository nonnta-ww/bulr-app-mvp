/**
 * get-teamwork-style-survey-id — teamwork_style survey の id 解決（実 DB 接続）統合テスト
 *
 * 検証内容（task 4.1 / Req 2.2, 2.3）:
 *  1. teamwork_style survey を seed 投入済み → その survey の id（string）を返す。
 *  2. 返り値の id は kind='teamwork_style' の survey を直接 SELECT した id と一致する。
 *
 * null ケース（未投入 → null）について: teamwork_style survey（マスタ）は共有 seed であり削除しない。
 *   未投入経路はクエリ契約（`rows[0]?.id ?? null`）で担保する（コードレビュー確認）。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する。スキーマは drizzle migrator で自己適用する。
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { DB } from '../client';
import { skillSurvey } from '../schema/skill-survey';
import { runTeamworkStyleSkillSurveySeed } from '../seeds/skill-surveys/teamwork-style';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[get-teamwork-style-survey-id.integration] DATABASE_URL 未設定のためスキップします。');
}

let db: DB;
let getTeamworkStyleSurveyId: typeof import('../queries/teamwork-style/get-teamwork-style-survey-id')['getTeamworkStyleSurveyId'];

describeDb('get-teamwork-style-survey-id 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/teamwork-style/get-teamwork-style-survey-id');
    getTeamworkStyleSurveyId = queryMod.getTeamworkStyleSurveyId;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    await runTeamworkStyleSkillSurveySeed(db);
  });

  it('seed 済み → teamwork_style survey の id（string）を返す (Req 2.2)', async () => {
    const id = await getTeamworkStyleSurveyId();

    expect(id).not.toBeNull();
    expect(typeof id).toBe('string');

    const [row] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.kind, 'teamwork_style'))
      .limit(1);
    expect(row).toBeTruthy();
    expect(id).toBe(row!.id);
  });
});

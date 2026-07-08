/**
 * get-playstyle-survey-id — 気質（playstyle）survey の id 解決（実 DB 接続）統合テスト
 *
 * 検証内容（task 3.1 / Req 6.1）:
 *  1. playstyle survey を seed 投入済み → その survey の id（string）を返す。
 *  2. 返り値の id は kind='playstyle' の survey を直接 SELECT した id と一致する。
 *
 * null ケース（未投入 → null）について:
 *   playstyle survey（マスタ）は共有 seed であり、他スイートが依存するため削除しない。
 *   共有マスタを削除せずに未投入状態を作れないため、null 経路はクエリ契約の SELECT ...
 *   WHERE kind='playstyle' LIMIT 1 が 0 件時に undefined → null を返す構造で担保する
 *   （実装が `rows[0]?.id ?? null` であることをコードレビューで確認）。ここでは主要 DB
 *   アサーションとして「seed 済みで id（string）が返る」ことと「実 survey id と一致する」ことを検証する。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 *   スキーマは drizzle migrator で自己適用する（適用済みなら no-op）。
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { DB } from '../client';
import { skillSurvey } from '../schema/skill-survey';
import { runPlaystyleSkillSurveySeed } from '../seeds/skill-surveys/playstyle';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[get-playstyle-survey-id.integration] DATABASE_URL 未設定のためスキップします。');
}

let db: DB;
let getPlaystyleSurveyId: typeof import('../queries/class-diagnosis/get-playstyle-survey-id')['getPlaystyleSurveyId'];

describeDb('get-playstyle-survey-id 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/class-diagnosis/get-playstyle-survey-id');
    getPlaystyleSurveyId = queryMod.getPlaystyleSurveyId;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });

    // playstyle survey を投入（kind='playstyle'）。冪等。
    await runPlaystyleSkillSurveySeed(db);
  });

  it('seed 済み → playstyle survey の id（string）を返す (Req 6.1)', async () => {
    const id = await getPlaystyleSurveyId();

    expect(id).not.toBeNull();
    expect(typeof id).toBe('string');

    // 直接 SELECT した kind='playstyle' の survey id と一致する。
    const [row] = await db
      .select({ id: skillSurvey.id })
      .from(skillSurvey)
      .where(eq(skillSurvey.kind, 'playstyle'))
      .limit(1);
    expect(row).toBeTruthy();
    expect(id).toBe(row!.id);
  });
});

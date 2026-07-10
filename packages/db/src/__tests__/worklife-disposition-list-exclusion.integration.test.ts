/**
 * worklife-disposition-list-exclusion — 職種アンケート一覧の志向診断除外（実 DB 接続）統合テスト
 *
 * 検証内容（spec: worklife-disposition-survey, R6.4）:
 *  1. getAnsweredSurveysForCandidate は kind='skill' の survey を返す。
 *  2. kind='worklife_disposition' の survey は回答済みでも一覧に含めない。
 *  3. 除外は answered-surveys-query.ts の非改修（既存 eq(kind,'skill') 包含フィルタ）で担保される。
 *
 * 実行前提: ローカル Postgres 起動 + DATABASE_URL。未設定時は skip。
 *   スキーマは drizzle migrator で自己適用する。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import type { DB } from '../client';
import { skillSurvey } from '../schema/skill-survey';
import { skillSurveyResponse } from '../schema/skill-survey-response';
import { candidateProfile } from '../schema/candidate-profile';
import { user } from '../schema/auth';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn(
    '[worklife-disposition-list-exclusion.integration] DATABASE_URL 未設定のためスキップします。',
  );
}

let db: DB;
let getAnsweredSurveysForCandidate: typeof import('../queries/self-analysis/answered-surveys-query')['getAnsweredSurveysForCandidate'];

const created: {
  userIds: string[];
  profileIds: string[];
  responseIds: string[];
  surveyIds: string[];
} = {
  userIds: [],
  profileIds: [],
  responseIds: [],
  surveyIds: [],
};

describeDb('worklife-disposition-list-exclusion 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    const queryMod = await import('../queries/self-analysis/answered-surveys-query');
    getAnsweredSurveysForCandidate = queryMod.getAnsweredSurveysForCandidate;

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    if (!db) return;
    if (created.responseIds.length > 0) {
      await db.delete(skillSurveyResponse).where(inArray(skillSurveyResponse.id, created.responseIds));
    }
    if (created.surveyIds.length > 0) {
      await db.delete(skillSurvey).where(inArray(skillSurvey.id, created.surveyIds));
    }
    if (created.profileIds.length > 0) {
      await db.delete(candidateProfile).where(inArray(candidateProfile.id, created.profileIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, created.userIds));
    }
  });

  it('kind=skill は含み kind=worklife_disposition は除外する (R6.4)', async () => {
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'worklife-list-exclusion-test' })
      .returning({ id: candidateProfile.id });
    const profileId = prof!.id;
    created.profileIds.push(profileId);

    // kind='skill' survey を最小構成で作成
    const skillJobType = `skill-it-${randomUUID()}`;
    const [skillSurveyRow] = await db
      .insert(skillSurvey)
      .values({ jobType: skillJobType, kind: 'skill', title: 'list-exclusion-skill' })
      .returning({ id: skillSurvey.id });
    created.surveyIds.push(skillSurveyRow!.id);

    // kind='worklife_disposition' survey を最小構成で作成
    const worklifeJobType = `worklife-it-${randomUUID()}`;
    const [worklifeSurveyRow] = await db
      .insert(skillSurvey)
      .values({ jobType: worklifeJobType, kind: 'worklife_disposition', title: 'list-exclusion-worklife' })
      .returning({ id: skillSurvey.id });
    created.surveyIds.push(worklifeSurveyRow!.id);

    // 両 survey に response を挿入（同一候補者）
    for (const s of [skillSurveyRow!, worklifeSurveyRow!]) {
      const [resp] = await db
        .insert(skillSurveyResponse)
        .values({ candidateProfileId: profileId, skillSurveyId: s.id, submittedAt: now })
        .returning({ id: skillSurveyResponse.id });
      created.responseIds.push(resp!.id);
    }

    const result = await getAnsweredSurveysForCandidate(profileId);

    // skill survey は含まれる
    expect(result.some((r) => r.surveyId === skillSurveyRow!.id)).toBe(true);
    expect(result.some((r) => r.jobType === skillJobType)).toBe(true);

    // worklife_disposition survey は除外される（answered-surveys-query.ts 非改修で担保）
    expect(result.some((r) => r.surveyId === worklifeSurveyRow!.id)).toBe(false);
    expect(result.some((r) => r.jobType === worklifeJobType)).toBe(false);

    // 集約件数は skill survey のみを反映
    expect(result.length).toBe(1);
  });
});

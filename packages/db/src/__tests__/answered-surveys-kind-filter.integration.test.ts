/**
 * answered-surveys-kind-filter — 職種アンケート一覧の kind フィルタ（実 DB 接続）統合テスト
 *
 * 検証内容（task 4.3 / Req 1.1）:
 *  1. getAnsweredSurveysForCandidate は kind='skill' の survey を返す。
 *  2. kind='playstyle' の survey は回答済みでも一覧に含めない（playstyle 除外ルール）。
 *  3. 集約件数は skill survey のみを反映する。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 * スキーマは drizzle migrator で自己適用する（適用済みなら no-op）。
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
    '[answered-surveys-kind-filter.integration] DATABASE_URL 未設定のためスキップします。',
  );
}

// 動的 import で取得する値（DATABASE_URL があるときのみ client を評価する）
let db: DB;
let getAnsweredSurveysForCandidate: typeof import('../queries/self-analysis/answered-surveys-query')['getAnsweredSurveysForCandidate'];

// 後始末用に作成したレコード ID
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

describeDb('answered-surveys-kind-filter 統合テスト', () => {
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

  it('kind=skill は含み kind=playstyle は除外する (Req 1.1)', async () => {
    const now = new Date();
    const userId = `it-${randomUUID()}`;
    created.userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    const [prof] = await db
      .insert(candidateProfile)
      .values({ userId, displayName: 'answered-surveys-kind-filter-test' })
      .returning({ id: candidateProfile.id });
    const profileId = prof!.id;
    created.profileIds.push(profileId);

    // kind='skill' survey を最小構成で作成
    const skillJobType = `skill-it-${randomUUID()}`;
    const [skillSurveyRow] = await db
      .insert(skillSurvey)
      .values({ jobType: skillJobType, kind: 'skill', title: 'kind-filter-skill' })
      .returning({ id: skillSurvey.id });
    created.surveyIds.push(skillSurveyRow!.id);

    // kind='playstyle' survey を最小構成で作成
    const playstyleJobType = `playstyle-it-${randomUUID()}`;
    const [playstyleSurveyRow] = await db
      .insert(skillSurvey)
      .values({ jobType: playstyleJobType, kind: 'playstyle', title: 'kind-filter-playstyle' })
      .returning({ id: skillSurvey.id });
    created.surveyIds.push(playstyleSurveyRow!.id);

    // 両 survey に response を挿入（同一候補者）
    for (const s of [skillSurveyRow!, playstyleSurveyRow!]) {
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

    // playstyle survey は除外される
    expect(result.some((r) => r.surveyId === playstyleSurveyRow!.id)).toBe(false);
    expect(result.some((r) => r.jobType === playstyleJobType)).toBe(false);

    // 集約件数は skill survey のみを反映（本候補者は skill 1 本のみ回答扱い）
    expect(result.length).toBe(1);
  });
});
